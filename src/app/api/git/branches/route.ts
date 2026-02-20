import { NextRequest, NextResponse } from 'next/server';
import { listBranches, getRepoPath } from '@/lib/worktree-service';
import { getProviders } from '@/lib/git-service';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Fetch branches remotely via CLI APIs when repo not cloned locally
async function fetchRemoteBranches(projectId: string): Promise<{ name: string; isRemote: boolean; isLocal: boolean; isCurrent: boolean; hasWorktree: boolean }[]> {
  const providers = await getProviders();
  
  // Try to find project info from saved projects
  const projectsDir = path.join(process.cwd(), 'data', 'projects');
  let repoOwner = '';
  let repoName = '';
  let provider = '';
  
  // Parse projectId format: "owner/name"
  const parts = projectId.split('/');
  if (parts.length >= 2) {
    repoOwner = parts.slice(0, -1).join('/');
    repoName = parts[parts.length - 1];
  }
  
  // Also check saved project files
  try {
    const files = await fs.readdir(projectsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(path.join(projectsDir, file), 'utf8');
      const proj = JSON.parse(content);
      if (proj.id === projectId || proj.name === projectId) {
        repoOwner = proj.repo_owner || repoOwner;
        repoName = proj.repo_name || proj.name || repoName;
        provider = proj.provider || '';
        break;
      }
    }
  } catch { /* no saved projects */ }
  
  if (!repoOwner || !repoName) return [];
  
  // Try GitHub
  for (const p of providers) {
    if (p.type === 'github') {
      try {
        const { stdout } = await execAsync(
          `${p.cli} api /repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/branches --jq '.[].name' 2>/dev/null`
        );
        const names = stdout.trim().split('\n').filter(Boolean);
        if (names.length > 0) {
          return names.map(name => ({ name, isRemote: true, isLocal: false, isCurrent: false, hasWorktree: false }));
        }
      } catch { /* not a github repo */ }
    }
    
    if (p.type === 'gitlab') {
      const cli = p.cli.startsWith('~/') 
        ? path.join(process.env.HOME || '/root', p.cli.slice(2)) 
        : p.cli;
      try {
        // Search for the project on GitLab
        const { stdout } = await execAsync(
          `${cli} api "/projects?search=${encodeURIComponent(repoName)}&owned=false&membership=true&per_page=20" 2>/dev/null`
        );
        const projects = JSON.parse(stdout);
        const repoNameLower = repoName.toLowerCase().replace(/\s+/g, '-');
        const match = projects.find((proj: { path: string; name: string; namespace: { full_path: string } }) => 
          proj.path === repoName || 
          proj.path === repoNameLower ||
          proj.name === repoName ||
          proj.name.toLowerCase() === repoName.toLowerCase() ||
          `${proj.namespace.full_path}/${proj.path}` === `${repoOwner}/${repoName}` ||
          `${proj.namespace.full_path}/${proj.path}` === `${repoOwner}/${repoNameLower}`
        );
        if (match) {
          const { stdout: branchOut } = await execAsync(
            `${cli} api "/projects/${match.id}/repository/branches?per_page=100" 2>/dev/null`
          );
          const branchData = JSON.parse(branchOut);
          return branchData.map((b: { name: string; default: boolean }) => ({
            name: b.name,
            isRemote: true,
            isLocal: false,
            isCurrent: b.default || false,
            hasWorktree: false,
          }));
        }
      } catch { /* not a gitlab repo */ }
    }
  }
  
  return [];
}

import { resolveProjectId } from '@/lib/project-resolver';

// POST /api/git/branches — create a branch in the repo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project: rawProject, branch: branchName, baseBranch } = body;

    if (!rawProject || !branchName) {
      return NextResponse.json(
        { error: 'project and branch are required' },
        { status: 400 }
      );
    }

    const project = await resolveProjectId(rawProject);
    const repoPath = await getRepoPath(project);

    if (!repoPath) {
      return NextResponse.json(
        { error: `Repository not found locally for project: ${project}. Clone it first or use Worktrees page.` },
        { status: 404 }
      );
    }

    const base = baseBranch || 'HEAD';
    await execAsync(`git branch "${branchName}" "${base}"`, { cwd: repoPath });
    // Push to remote
    await execAsync(`git push origin "${branchName}"`, { cwd: repoPath });

    return NextResponse.json({
      success: true,
      branch: branchName,
      baseBranch: base,
      message: `Branch '${branchName}' created and pushed to origin`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error in POST /api/git/branches:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET /api/git/branches?project=<projectId>
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawProject = searchParams.get('project');
    
    if (!rawProject) {
      return NextResponse.json(
        { error: 'Project parameter is required' },
        { status: 400 }
      );
    }
    
    const project = await resolveProjectId(rawProject);
    
    // Try local repo first
    const repoPath = await getRepoPath(project);
    if (repoPath) {
      const branches = await listBranches(repoPath);
      return NextResponse.json({ branches });
    }
    
    // Fallback: fetch remote branches via API
    const remoteBranches = await fetchRemoteBranches(project);
    if (remoteBranches.length > 0) {
      return NextResponse.json({ branches: remoteBranches });
    }
    
    return NextResponse.json({ branches: [] });
  } catch (error) {
    console.error('Error in GET /api/git/branches:', error);
    return NextResponse.json(
      { error: 'Failed to list branches' },
      { status: 500 }
    );
  }
}