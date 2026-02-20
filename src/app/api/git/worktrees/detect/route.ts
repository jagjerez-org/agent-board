import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { resolveProjectId } from '@/lib/project-resolver';

interface DetectedApp {
  name: string;
  type: 'flutter' | 'node' | 'python' | 'unknown';
  command: string;
  cwd: string; // relative to worktree root
  port?: number;
  packageManager?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function detectPackageManager(dir: string): Promise<'pnpm' | 'yarn' | 'bun' | 'npm'> {
  // Check current dir and parent dirs (for monorepos where lockfile is at root)
  let current = dir;
  for (let i = 0; i < 5; i++) {
    if (await fileExists(path.join(current, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await fileExists(path.join(current, 'yarn.lock'))) return 'yarn';
    if (await fileExists(path.join(current, 'bun.lockb'))) return 'bun';
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return 'npm';
}

async function detectNodeApp(dir: string, relativePath: string): Promise<DetectedApp | null> {
  const pkgPath = path.join(dir, 'package.json');
  if (!await fileExists(pkgPath)) return null;
  
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const pm = await detectPackageManager(dir);
    
    // Find the best dev command
    let script = '';
    if (scripts.dev) script = 'dev';
    else if (scripts.start) script = 'start';
    else if (scripts.serve) script = 'serve';
    else return null;

    // Detect framework for port and host config
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let port: number | undefined;
    let framework = '';
    let hostFlag = ''; // How to bind to 0.0.0.0 for this framework
    
    if (deps['next']) { framework = 'Next.js'; port = 3000; hostFlag = '-H 0.0.0.0'; }
    else if (deps['nuxt']) { framework = 'Nuxt'; port = 3000; hostFlag = '--host 0.0.0.0'; }
    else if (deps['vite'] || deps['@vitejs/plugin-react']) { framework = 'Vite'; port = 5173; hostFlag = '--host 0.0.0.0'; }
    else if (deps['@angular/core']) { framework = 'Angular'; port = 4200; hostFlag = '--host 0.0.0.0'; }
    else if (deps['@nestjs/core']) { framework = 'NestJS'; port = 3000; } // NestJS uses HOST env var
    else if (deps['express']) { framework = 'Express'; port = 3000; } // Express uses HOST env var
    else if (deps['webpack-dev-server']) { hostFlag = '--host 0.0.0.0'; }
    else if (deps['react-scripts']) { framework = 'CRA'; port = 3000; } // CRA uses HOST env var

    // Build command with host binding
    const baseCmd = `${pm} ${script === 'start' ? 'start' : `run ${script}`}`;
    // For frameworks that accept CLI flags, append them via -- separator
    const command = hostFlag ? `${baseCmd} -- ${hostFlag}` : baseCmd;

    return {
      name: pkg.name || path.basename(dir),
      type: 'node',
      command,
      cwd: relativePath,
      port,
      packageManager: pm,
    };
  } catch { return null; }
}

async function detectFlutterApp(dir: string, relativePath: string, usedPorts: Set<number>): Promise<DetectedApp | null> {
  const pubspecPath = path.join(dir, 'pubspec.yaml');
  if (!await fileExists(pubspecPath)) return null;
  
  try {
    const content = await fs.readFile(pubspecPath, 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)/m);
    const name = nameMatch ? nameMatch[1].trim() : path.basename(dir);
    
    // Check if it's a Flutter app (has flutter dependency and main.dart)
    const hasFlutter = content.includes('flutter:') && content.includes('sdk: flutter');
    const hasMain = await fileExists(path.join(dir, 'lib', 'main.dart'));
    
    if (!hasFlutter || !hasMain) return null;
    
    // Assign a port that's not in use
    let port = 3200;
    while (usedPorts.has(port)) port++;
    usedPorts.add(port);
    
    return {
      name,
      type: 'flutter',
      command: `flutter run -d web-server --web-hostname=0.0.0.0 --web-port=${port}`,
      cwd: relativePath,
      port,
    };
  } catch { return null; }
}

async function scanMonorepoApps(rootDir: string): Promise<DetectedApp[]> {
  const apps: DetectedApp[] = [];
  const usedPorts = new Set<number>();
  
  // Check common monorepo app directories
  const appDirs = ['apps', 'packages', 'modules', 'services'];
  
  for (const appDir of appDirs) {
    const fullDir = path.join(rootDir, appDir);
    if (!await fileExists(fullDir)) continue;
    
    try {
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subDir = path.join(fullDir, entry.name);
        const relativePath = `${appDir}/${entry.name}`;
        
        // Try Flutter first, then Node
        const flutter = await detectFlutterApp(subDir, relativePath, usedPorts);
        if (flutter) { apps.push(flutter); continue; }
        
        const node = await detectNodeApp(subDir, relativePath);
        if (node) apps.push(node);
      }
    } catch { /* skip */ }
  }
  
  return apps;
}

// GET /api/git/worktrees/detect?project=X&branch=Y
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProject = searchParams.get('project') || '';
    const branch = searchParams.get('branch') || '';
    
    if (!rawProject || !branch) {
      return NextResponse.json({ error: 'project and branch required' }, { status: 400 });
    }
    
    const project = await resolveProjectId(rawProject);
    
    // Find worktree path
    const { getRepoPath, getWorktreeForBranch } = await import('@/lib/worktree-service');
    let worktreePath: string | null = null;
    
    // Try to find worktree via git
    try {
      const repoPath = await getRepoPath(project);
      if (repoPath) {
        const wt = await getWorktreeForBranch(repoPath, branch);
        if (wt) {
          worktreePath = wt.path;
        } else {
          // No specific worktree for this branch — use main repo path
          worktreePath = repoPath;
        }
      }
    } catch { /* fallback below */ }
    
    if (!worktreePath) {
      return NextResponse.json({ error: 'Repository not found', apps: [] }, { status: 404 });
    }
    
    const apps: DetectedApp[] = [];
    const usedPorts = new Set<number>();
    
    // Check if root is a monorepo
    const isMelosMonorepo = await fileExists(path.join(worktreePath, 'melos.yaml'));
    const isPnpmMonorepo = await fileExists(path.join(worktreePath, 'pnpm-workspace.yaml'));
    const isTurboMonorepo = await fileExists(path.join(worktreePath, 'turbo.json'));
    const isMonorepo = isMelosMonorepo || isPnpmMonorepo || isTurboMonorepo;
    
    if (isMonorepo) {
      // Scan subdirectories for apps
      const monorepoApps = await scanMonorepoApps(worktreePath);
      apps.push(...monorepoApps);
    }
    
    // Also check root level
    const rootFlutter = await detectFlutterApp(worktreePath, '.', usedPorts);
    if (rootFlutter) apps.push(rootFlutter);
    
    const rootNode = await detectNodeApp(worktreePath, '.');
    if (rootNode) apps.push(rootNode);
    
    return NextResponse.json({
      worktreePath,
      isMonorepo,
      monorepoType: isMelosMonorepo ? 'melos' : isPnpmMonorepo ? 'pnpm' : isTurboMonorepo ? 'turbo' : null,
      apps,
    });
  } catch (error) {
    console.error('Error detecting apps:', error);
    return NextResponse.json({ error: 'Detection failed' }, { status: 500 });
  }
}
