import { NextRequest, NextResponse } from 'next/server';
import { resolve, join, dirname } from 'path';
import { readFile, readdir, stat, access } from 'fs/promises';

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed' };
  }
  return { isValid: true, fullPath };
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// Find the node_modules directory by walking up from the project path
async function findNodeModules(projectPath: string): Promise<string | null> {
  let current = projectPath;
  for (let i = 0; i < 10; i++) {
    const nm = join(current, 'node_modules');
    if (await fileExists(nm)) return nm;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// Resolve a package's type entry point
async function resolvePackageTypes(nodeModules: string, packageName: string): Promise<{ files: Array<{ path: string; content: string }> }> {
  const files: Array<{ path: string; content: string }> = [];
  
  // Handle scoped packages
  const pkgDir = join(nodeModules, packageName);
  
  // Check @types package first
  const atTypesName = packageName.startsWith('@types/')
    ? packageName
    : packageName.startsWith('@') 
      ? `@types/${packageName.slice(1).replace('/', '__')}` 
      : `@types/${packageName}`;
  const atTypesDir = join(nodeModules, atTypesName);
  
  // Try @types first, then package dir, then pnpm store
  let typesDir = '';
  if (await fileExists(join(atTypesDir, 'index.d.ts'))) {
    typesDir = atTypesDir;
  } else if (await fileExists(join(pkgDir, 'index.d.ts')) || await fileExists(pkgDir)) {
    typesDir = pkgDir;
  }
  
  // If not found, search in pnpm's .pnpm directory
  if (!typesDir || !await fileExists(join(typesDir, 'index.d.ts'))) {
    const pnpmDir = join(nodeModules, '.pnpm');
    if (await fileExists(pnpmDir)) {
      try {
        const pnpmEntries = await readdir(pnpmDir);
        const searchName = atTypesName.replace('/', '+').replace('@', '@');
        const match = pnpmEntries
          .filter(e => e.startsWith(searchName + '@'))
          .sort()
          .pop(); // latest version
        if (match) {
          const candidate = join(pnpmDir, match, 'node_modules', atTypesName);
          if (await fileExists(join(candidate, 'index.d.ts'))) {
            typesDir = candidate;
          }
        }
        // Also try the package itself (not @types)
        if (!typesDir && !packageName.startsWith('@types/')) {
          const pkgSearchName = packageName.replace('/', '+').replace('@', '@');
          const pkgMatch = pnpmEntries
            .filter(e => e.startsWith(pkgSearchName + '@'))
            .sort()
            .pop();
          if (pkgMatch) {
            const candidate = join(pnpmDir, pkgMatch, 'node_modules', packageName);
            if (await fileExists(candidate)) {
              typesDir = candidate;
            }
          }
        }
      } catch { /* skip */ }
    }
  }
  
  if (!typesDir) return { files };

  // Read package.json to find types entry
  let typesEntry = 'index.d.ts';
  try {
    const pkgJson = JSON.parse(await readFile(join(typesDir, 'package.json'), 'utf8'));
    typesEntry = pkgJson.types || pkgJson.typings || pkgJson.exports?.['.']?.types || 'index.d.ts';
    // Remove leading ./
    typesEntry = typesEntry.replace(/^\.\//, '');
  } catch { /* use default */ }

  // Recursively load type files starting from the entry point
  const pkgPrefix = typesDir === atTypesDir ? atTypesName : packageName;
  const visited = new Set<string>();
  
  async function loadTypeFile(filePath: string) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    if (visited.size > 100) return; // safety limit
    
    if (!await fileExists(filePath)) {
      // Try adding .d.ts extension
      if (await fileExists(filePath + '.d.ts')) filePath = filePath + '.d.ts';
      else return;
    }
    
    try {
      const content = await readFile(filePath, 'utf8');
      const relativePath = filePath.substring(typesDir.length + 1);
      const uri = `file:///node_modules/${pkgPrefix}/${relativePath}`;
      files.push({ path: uri, content });
      
      // Find references and relative imports
      const refs = [...content.matchAll(/\/\/\/\s*<reference\s+(?:path|types)="([^"]+)"/g)];
      const imports = [...content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
      
      for (const ref of refs) {
        const refName = ref[1];
        let refPath: string;
        if (ref[0].includes('types=')) {
          // /// <reference types="..." /> — skip, it's another package
          continue;
        }
        refPath = join(dirname(filePath), refName);
        if (!refPath.endsWith('.d.ts') && !refPath.endsWith('.ts')) refPath += '.d.ts';
        await loadTypeFile(refPath);
      }
      
      for (const imp of imports) {
        let impPath = join(dirname(filePath), imp[1]);
        if (!impPath.endsWith('.d.ts') && !impPath.endsWith('.ts')) impPath += '.d.ts';
        await loadTypeFile(impPath);
      }
    } catch { /* skip */ }
  }
  
  await loadTypeFile(join(typesDir, typesEntry));

  return { files };
}

// GET /api/files/types?path=/tmp/worktree&packages=react,next,@nestjs/common
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const packages = searchParams.get('packages');

    if (!requestedPath || !packages) {
      return NextResponse.json({ error: 'path and packages required' }, { status: 400 });
    }

    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const nodeModules = await findNodeModules(validation.fullPath!);
    if (!nodeModules) {
      return NextResponse.json({ error: 'node_modules not found' }, { status: 404 });
    }

    const pkgList = packages.split(',').map(p => p.trim()).filter(Boolean);
    const allFiles: Array<{ path: string; content: string }> = [];

    for (const pkg of pkgList) {
      const result = await resolvePackageTypes(nodeModules, pkg);
      allFiles.push(...result.files);
    }

    return NextResponse.json({ files: allFiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
