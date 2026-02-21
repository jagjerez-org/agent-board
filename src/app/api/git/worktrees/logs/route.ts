import { NextRequest, NextResponse } from 'next/server';
import { execSync, spawn } from 'child_process';
import { getRepoPath, getWorktreeForBranch } from '@/lib/worktree-service';
import { resolveProjectId } from '@/lib/project-resolver';

/**
 * Tmux-backed console sessions for worktrees.
 * Sessions survive agent-board restarts because tmux runs independently.
 *
 * Naming convention: ab_<project>_<branch>_<consoleId>
 * (sanitized to alphanumeric + underscore)
 */

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
}

function tmuxSessionName(project: string, branch: string, consoleId?: string): string {
  const base = `ab_${sanitize(project)}_${sanitize(branch)}`;
  return consoleId ? `${base}_${sanitize(consoleId)}` : `${base}_default`;
}

function tmuxSessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

function createTmuxSession(name: string, cwd: string): void {
  execSync(`tmux new-session -d -s ${name} -c "${cwd}"`, { timeout: 5000 });
}

function captureTmuxPane(name: string, lines = 2000): string {
  try {
    return execSync(`tmux capture-pane -t ${name} -p -S -${lines}`, {
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024,
    }).toString();
  } catch {
    return '';
  }
}

function sendTmuxKeys(name: string, command: string): void {
  // Send command + Enter to the tmux session
  execSync(`tmux send-keys -t ${name} ${JSON.stringify(command)} Enter`, { timeout: 5000 });
}

function killTmuxSession(name: string): void {
  try {
    execSync(`tmux kill-session -t ${name} 2>/dev/null`, { timeout: 5000 });
  } catch { /* session may already be gone */ }
}

function listTmuxSessions(prefix: string): string[] {
  try {
    const output = execSync(`tmux list-sessions -F "#{session_name}" 2>/dev/null`, { timeout: 5000 }).toString();
    return output.split('\n').filter(s => s.startsWith(prefix));
  } catch {
    return [];
  }
}

// SSE subscribers per session
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();
// Polling intervals per session
const pollers = new Map<string, NodeJS.Timeout>();
// Last known content per session (to detect changes)
const lastContent = new Map<string, string>();

function startPolling(sessionName: string) {
  if (pollers.has(sessionName)) return;

  const interval = setInterval(() => {
    const subs = subscribers.get(sessionName);
    if (!subs || subs.size === 0) {
      // No subscribers, stop polling
      clearInterval(interval);
      pollers.delete(sessionName);
      lastContent.delete(sessionName);
      return;
    }

    if (!tmuxSessionExists(sessionName)) return;

    const content = captureTmuxPane(sessionName, 200);
    const prev = lastContent.get(sessionName) || '';

    if (content !== prev) {
      lastContent.set(sessionName, content);

      // Find new lines
      const prevLines = prev.split('\n');
      const currentLines = content.split('\n');

      // Simple diff: send lines that are new at the end
      let newLines: string[];
      if (currentLines.length > prevLines.length) {
        newLines = currentLines.slice(prevLines.length);
      } else if (content !== prev) {
        // Content changed but same length — full refresh
        newLines = currentLines;
      } else {
        return;
      }

      const encoder = new TextEncoder();
      const payload = encoder.encode(`data: ${JSON.stringify({
        type: 'output',
        lines: newLines,
        fullContent: content,
        timestamp: new Date().toISOString(),
      })}\n\n`);

      subs.forEach(controller => {
        try { controller.enqueue(payload); } catch { /* dead connection */ }
      });
    }
  }, 500); // Poll every 500ms

  pollers.set(sessionName, interval);
}

// GET /api/git/worktrees/logs — SSE stream of tmux output
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawProject = params.get('project');
    const branch = params.get('branch');
    const consoleId = params.get('consoleId');

    if (!rawProject || !branch) {
      return NextResponse.json({ error: 'project and branch required' }, { status: 400 });
    }

    const project = await resolveProjectId(rawProject);
    const sessionName = tmuxSessionName(project, branch, consoleId || undefined);

    // If tmux session exists, send initial buffer
    const initialContent = tmuxSessionExists(sessionName) ? captureTmuxPane(sessionName) : '';

    let currentController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        currentController = controller;
        const encoder = new TextEncoder();

        // Send initial content
        if (initialContent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'initial',
            fullContent: initialContent,
            timestamp: new Date().toISOString(),
          })}\n\n`));
          lastContent.set(sessionName, initialContent);
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'system',
            message: 'Console ready. Run a command to start.',
            timestamp: new Date().toISOString(),
          })}\n\n`));
        }

        // Register subscriber
        if (!subscribers.has(sessionName)) {
          subscribers.set(sessionName, new Set());
        }
        subscribers.get(sessionName)!.add(controller);

        // Start polling if tmux session exists
        if (tmuxSessionExists(sessionName)) {
          startPolling(sessionName);
        }
      },
      cancel() {
        if (currentController) {
          const subs = subscribers.get(sessionName);
          if (subs) {
            subs.delete(currentController);
            if (subs.size === 0) subscribers.delete(sessionName);
          }
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/git/worktrees/logs:', error);
    return NextResponse.json({ error: 'Failed to stream logs' }, { status: 500 });
  }
}

// POST /api/git/worktrees/logs — Run command in tmux session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project: rawProject, branch, command, consoleId } = body;

    if (!rawProject || !branch || !command) {
      return NextResponse.json({ error: 'project, branch, and command required' }, { status: 400 });
    }

    const project = await resolveProjectId(rawProject);
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json({ error: `Repository not found: ${project}` }, { status: 404 });
    }

    const worktree = await getWorktreeForBranch(repoPath, branch);
    if (!worktree) {
      return NextResponse.json({ error: `No worktree for branch: ${branch}` }, { status: 404 });
    }

    const sessionName = tmuxSessionName(project, branch, consoleId || undefined);

    // Create tmux session if it doesn't exist
    if (!tmuxSessionExists(sessionName)) {
      createTmuxSession(sessionName, worktree.path);
      // Set up environment
      const homeDir = process.env.HOME || '/root';
      const extraPaths = [
        `${homeDir}/flutter/bin`,
        `${homeDir}/.pub-cache/bin`,
        `${homeDir}/.npm-global/bin`,
        `${homeDir}/.local/bin`,
        '/usr/local/bin',
      ].join(':');
      sendTmuxKeys(sessionName, `export PATH="${extraPaths}:$PATH"`);
      // Small delay for the export to take effect
      await new Promise(r => setTimeout(r, 200));
    }

    // Send command
    sendTmuxKeys(sessionName, command);

    // Ensure polling is running
    startPolling(sessionName);

    return NextResponse.json({
      success: true,
      session: sessionName,
      message: `Command sent: ${command}`,
    });
  } catch (error) {
    console.error('Error in POST /api/git/worktrees/logs:', error);
    return NextResponse.json({ error: 'Failed to run command' }, { status: 500 });
  }
}

// DELETE /api/git/worktrees/logs — Kill tmux session
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { project: rawProject, branch, consoleId } = body;

    if (!rawProject || !branch) {
      return NextResponse.json({ error: 'project and branch required' }, { status: 400 });
    }

    const project = await resolveProjectId(rawProject);
    const sessionName = tmuxSessionName(project, branch, consoleId || undefined);

    if (!tmuxSessionExists(sessionName)) {
      return NextResponse.json({ error: 'No active session found' }, { status: 404 });
    }

    // Notify subscribers
    const subs = subscribers.get(sessionName);
    if (subs) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(`data: ${JSON.stringify({
        type: 'system',
        message: 'Session killed by user',
        timestamp: new Date().toISOString(),
      })}\n\n`);
      subs.forEach(c => { try { c.enqueue(payload); c.close(); } catch {} });
      subscribers.delete(sessionName);
    }

    // Clean up polling
    const poller = pollers.get(sessionName);
    if (poller) { clearInterval(poller); pollers.delete(sessionName); }
    lastContent.delete(sessionName);

    killTmuxSession(sessionName);

    return NextResponse.json({ success: true, message: 'Session killed' });
  } catch (error) {
    console.error('Error in DELETE /api/git/worktrees/logs:', error);
    return NextResponse.json({ error: 'Failed to kill session' }, { status: 500 });
  }
}
