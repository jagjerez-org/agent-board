import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

function validatePath(requestedPath: string): { isValid: boolean; fullPath?: string; error?: string } {
  const fullPath = resolve(requestedPath);
  if (!fullPath.startsWith('/tmp/')) {
    return { isValid: false, error: 'Path outside /tmp/ not allowed' };
  }
  return { isValid: true, fullPath };
}

// GET /api/files/git-changes?path=/tmp/worktree&base=master
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const base = searchParams.get('base') || 'master';

    if (!requestedPath) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }

    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const cwd = validation.fullPath!;

    // Get current branch
    let currentBranch = '';
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd });
      currentBranch = stdout.trim();
    } catch { /* ignore */ }

    // Get merge base to find what changed in this branch
    let mergeBase = base;
    try {
      const { stdout } = await execAsync(`git merge-base ${base} HEAD`, { cwd });
      mergeBase = stdout.trim();
    } catch {
      // If no merge base (e.g., new repo), compare against empty tree
      mergeBase = '4b825dc642cb6eb9a060e54bf899d15f3f338fb9'; // git empty tree hash
    }

    // Get changed files compared to base
    const { stdout: diffOutput } = await execAsync(
      `git diff --name-status ${mergeBase}...HEAD`,
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    // Also get unstaged/staged changes
    const { stdout: statusOutput } = await execAsync(
      'git status --porcelain',
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse branch diff
    const branchChanges = diffOutput.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      return {
        status: status.charAt(0) as 'A' | 'M' | 'D' | 'R' | 'C',
        path: filePath,
        fullPath: `${cwd}/${filePath}`,
      };
    });

    // Parse working tree changes
    const workingChanges = statusOutput.trim().split('\n').filter(Boolean).map(line => {
      const staged = line.charAt(0);
      const unstaged = line.charAt(1);
      const filePath = line.substring(3).trim();
      return {
        staged: staged !== ' ' && staged !== '?' ? staged : null,
        unstaged: unstaged !== ' ' ? unstaged : null,
        isUntracked: staged === '?',
        path: filePath,
        fullPath: `${cwd}/${filePath}`,
      };
    });

    // Get stats
    let stats = { filesChanged: 0, insertions: 0, deletions: 0 };
    try {
      const { stdout } = await execAsync(`git diff --stat ${mergeBase}...HEAD`, { cwd });
      const lastLine = stdout.trim().split('\n').pop() || '';
      const filesMatch = lastLine.match(/(\d+) files? changed/);
      const insMatch = lastLine.match(/(\d+) insertions?/);
      const delMatch = lastLine.match(/(\d+) deletions?/);
      stats = {
        filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
        insertions: insMatch ? parseInt(insMatch[1]) : 0,
        deletions: delMatch ? parseInt(delMatch[1]) : 0,
      };
    } catch { /* ignore */ }

    return NextResponse.json({
      currentBranch,
      base,
      branchChanges,
      workingChanges,
      stats,
    });

  } catch (error: any) {
    console.error('Git changes error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
