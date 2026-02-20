import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execAsync = promisify(exec);

// GET /api/files/git-show?path=/tmp/worktree&file=src/index.ts&ref=master
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const file = searchParams.get('file');
    const ref = searchParams.get('ref') || 'master';

    if (!requestedPath || !file) {
      return NextResponse.json({ error: 'path and file required' }, { status: 400 });
    }

    const fullPath = resolve(requestedPath);
    if (!fullPath.startsWith('/tmp/')) {
      return NextResponse.json({ error: 'Path outside /tmp/ not allowed' }, { status: 403 });
    }

    // Try merge-base first for accurate branch comparison
    let baseRef = ref;
    try {
      const { stdout } = await execAsync(`git merge-base ${ref} HEAD`, { cwd: fullPath });
      baseRef = stdout.trim();
    } catch {
      // Use ref directly if merge-base fails
    }

    let content = '';
    try {
      const { stdout } = await execAsync(`git show "${baseRef}:${file}"`, {
        cwd: fullPath,
        maxBuffer: 5 * 1024 * 1024,
      });
      content = stdout;
    } catch {
      // File doesn't exist in base — it's a new file
      content = '';
    }

    return NextResponse.json({ content, ref: baseRef });
  } catch (error: any) {
    console.error('Git show error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
