import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { resolveProjectId } from '@/lib/project-resolver';

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
}

interface TmuxSession {
  sessionName: string;
  consoleId: string;
  branch: string;
  created: string;
  activity: string;
}

// GET /api/git/worktrees/sessions?project=<id>&branch=<branch>
// Lists active tmux sessions for a project (optionally filtered by branch)
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawProject = params.get('project');
    const branchFilter = params.get('branch');

    if (!rawProject) {
      return NextResponse.json({ error: 'project required' }, { status: 400 });
    }

    const project = await resolveProjectId(rawProject);
    const prefix = `ab_${sanitize(project)}_`;
    const branchPrefix = branchFilter ? `ab_${sanitize(project)}_${sanitize(branchFilter)}_` : null;

    let sessions: TmuxSession[] = [];

    try {
      const output = execSync(
        `tmux list-sessions -F "#{session_name}|#{session_created}|#{session_activity}" 2>/dev/null`,
        { timeout: 5000 }
      ).toString().trim();

      if (output) {
        for (const line of output.split('\n')) {
          const [name, created, activity] = line.split('|');
          if (!name.startsWith(prefix)) continue;
          if (branchPrefix && !name.startsWith(branchPrefix)) continue;

          // Parse session name: ab_<project>_<branch>_<consoleId>
          const suffix = name.slice(prefix.length); // e.g., "main_console_1"
          // The consoleId is everything after the branch prefix
          const consoleId = branchPrefix ? name.slice(branchPrefix.length) : suffix.split('_').slice(-1)[0] || 'default';
          // Extract branch from the session name
          const branch = branchFilter || suffix.replace(`_${consoleId}`, '');

          sessions.push({
            sessionName: name,
            consoleId,
            branch,
            created: created ? new Date(parseInt(created) * 1000).toISOString() : '',
            activity: activity ? new Date(parseInt(activity) * 1000).toISOString() : '',
          });
        }
      }
    } catch {
      // tmux not running or no sessions
    }

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error listing tmux sessions:', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}
