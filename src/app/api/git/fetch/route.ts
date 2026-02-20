import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveProjectId } from '@/lib/project-resolver';
import { getRepoPath } from '@/lib/worktree-service';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { project: rawProject } = await request.json();
    if (!rawProject) {
      return NextResponse.json({ error: 'Project required' }, { status: 400 });
    }

    const project = await resolveProjectId(rawProject);
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json({ error: 'No local clone found for this project' }, { status: 400 });
    }

    const { stdout, stderr } = await execAsync('git fetch --all --prune', {
      cwd: repoPath,
      timeout: 30000,
    });

    return NextResponse.json({
      success: true,
      output: (stdout + stderr).trim(),
    });
  } catch (error: any) {
    console.error('Git fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch' },
      { status: 500 }
    );
  }
}
