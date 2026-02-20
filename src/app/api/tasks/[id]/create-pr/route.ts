// POST /api/tasks/[id]/create-pr — auto-create a GitHub PR for the task's branch
import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/task-store';
import { eventBus } from '@/lib/event-bus';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

interface Props {
  params: Promise<{ id: string }>;
}

function getRepoRemote(worktreePath: string): { owner: string; repo: string; provider: 'github' | 'gitlab' } | null {
  try {
    const remote = execSync('git remote get-url origin', { cwd: worktreePath, encoding: 'utf8' }).trim();
    // SSH: git@github.com:owner/repo.git or git@gitlab.com:owner/repo.git
    const sshMatch = remote.match(/git@(github|gitlab)\.com:(.+?)\/(.+?)(?:\.git)?$/);
    if (sshMatch) return { owner: sshMatch[2], repo: sshMatch[3], provider: sshMatch[1] as any };
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remote.match(/https?:\/\/(github|gitlab)\.com\/(.+?)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) return { owner: httpsMatch[2], repo: httpsMatch[3], provider: httpsMatch[1] as any };
    return null;
  } catch { return null; }
}

function findWorktreePath(branch: string, projectId?: string): string | null {
  // Check common worktree locations
  const worktreeBase = '/tmp/kadens-worktrees';
  const sanitized = branch.replace(/\//g, '_');
  const candidates = [
    join(worktreeBase, sanitized),
    join(worktreeBase, branch),
    `/tmp/${sanitized}`,
  ];
  
  // Also check if the branch exists in the main repo
  if (projectId) {
    const projectPaths: Record<string, string> = {
      kadens: '/tmp/kadens',
      langopia: '/tmp/langopia',
      ala_app: '/tmp/ala_app',
    };
    const mainPath = projectPaths[projectId];
    if (mainPath) candidates.unshift(mainPath);
  }

  for (const p of candidates) {
    if (existsSync(join(p, '.git'))) return p;
  }
  return null;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { task } = result;

    if (!task.branch) {
      return NextResponse.json({ error: 'Task has no branch assigned' }, { status: 400 });
    }

    const worktreePath = findWorktreePath(task.branch, task.project_id);
    if (!worktreePath) {
      return NextResponse.json({ error: `Worktree not found for branch: ${task.branch}` }, { status: 404 });
    }

    const repoInfo = getRepoRemote(worktreePath);
    if (!repoInfo) {
      return NextResponse.json({ error: 'Could not determine repository remote' }, { status: 400 });
    }

    // Push the branch first
    try {
      execSync(`git push -u origin ${task.branch}`, { cwd: worktreePath, encoding: 'utf8', timeout: 30000 });
    } catch (e: any) {
      // Ignore "already up to date" type errors
      if (!e.stderr?.includes('Everything up-to-date') && !e.stdout?.includes('Everything up-to-date')) {
        console.warn('Git push warning:', e.stderr || e.message);
      }
    }

    // Build PR body from refinement
    const prBody = [
      `## ${task.title}`,
      '',
      task.description || '',
      '',
      task.refinement ? `### Refinement\n${task.refinement}` : '',
      '',
      `---`,
      `*Auto-created by Agent Board*`,
    ].filter(Boolean).join('\n');

    let prUrl = '';

    if (repoInfo.provider === 'github') {
      // Use gh CLI
      try {
        const result = execSync(
          `gh pr create --base main --head "${task.branch}" --title "${task.title.replace(/"/g, '\\"')}" --body-file -`,
          {
            cwd: worktreePath,
            encoding: 'utf8',
            input: prBody,
            timeout: 30000,
          }
        );
        prUrl = result.trim();
      } catch (e: any) {
        // Check if PR already exists
        if (e.stderr?.includes('already exists')) {
          const existing = execSync(`gh pr view ${task.branch} --json url -q .url`, { cwd: worktreePath, encoding: 'utf8', timeout: 10000 }).trim();
          prUrl = existing;
        } else {
          throw e;
        }
      }
    } else if (repoInfo.provider === 'gitlab') {
      // Use glab CLI
      const glabPath = join(process.env.HOME || '/root', '.local/bin/glab');
      try {
        const result = execSync(
          `${glabPath} mr create --source-branch "${task.branch}" --target-branch main --title "${task.title.replace(/"/g, '\\"')}" --description - --yes`,
          {
            cwd: worktreePath,
            encoding: 'utf8',
            input: prBody,
            timeout: 30000,
          }
        );
        // Extract URL from output
        const urlMatch = result.match(/https?:\/\/\S+/);
        prUrl = urlMatch ? urlMatch[0] : '';
      } catch (e: any) {
        if (e.stderr?.includes('already exists') || e.stdout?.includes('already exists')) {
          const existing = execSync(`${glabPath} mr view ${task.branch} --output json`, { cwd: worktreePath, encoding: 'utf8', timeout: 10000 });
          const parsed = JSON.parse(existing);
          prUrl = parsed.web_url || '';
        } else {
          throw e;
        }
      }
    }

    // Update task with PR URL
    if (prUrl) {
      await updateTask(id, { pr_url: prUrl, pr_status: 'open' });
      const updated = await getTask(id);
      if (updated) eventBus.emit({ type: 'task:updated', payload: updated.task });
    }

    return NextResponse.json({ success: true, pr_url: prUrl });
  } catch (error: any) {
    console.error('Create PR error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create PR' }, { status: 500 });
  }
}
