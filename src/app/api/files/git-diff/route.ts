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

// GET /api/files/git-diff?path=/tmp/worktree&file=src/index.ts&base=master
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const file = searchParams.get('file');
    const base = searchParams.get('base') || 'master';
    const mode = searchParams.get('mode') || 'branch'; // 'branch' | 'working'

    if (!requestedPath || !file) {
      return NextResponse.json({ error: 'path and file required' }, { status: 400 });
    }

    const validation = validatePath(requestedPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const cwd = validation.fullPath!;
    let diff = '';

    if (mode === 'working') {
      // Working tree diff (unstaged changes)
      try {
        const { stdout } = await execAsync(`git diff -- "${file}"`, { cwd, maxBuffer: 5 * 1024 * 1024 });
        diff = stdout;
      } catch { /* empty diff */ }
      // If no unstaged, try staged
      if (!diff) {
        try {
          const { stdout } = await execAsync(`git diff --cached -- "${file}"`, { cwd, maxBuffer: 5 * 1024 * 1024 });
          diff = stdout;
        } catch { /* empty diff */ }
      }
    } else {
      // Branch diff (compared to merge-base)
      let mergeBase = base;
      try {
        const { stdout } = await execAsync(`git merge-base ${base} HEAD`, { cwd });
        mergeBase = stdout.trim();
      } catch {
        mergeBase = '4b825dc642cb6eb9a060e54bf899d15f3f338fb9';
      }
      try {
        const { stdout } = await execAsync(`git diff ${mergeBase}...HEAD -- "${file}"`, { cwd, maxBuffer: 5 * 1024 * 1024 });
        diff = stdout;
      } catch { /* empty diff */ }
    }

    return NextResponse.json({ file, diff, mode });

  } catch (error: any) {
    console.error('Git diff error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
