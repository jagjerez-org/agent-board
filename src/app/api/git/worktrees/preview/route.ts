import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getRepoPath, getWorktreeForBranch } from '@/lib/worktree-service';
import { resolveProjectId } from '@/lib/project-resolver';

interface PreviewServer {
  branch: string;
  port: number;
  pid: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startedAt: string;
  command?: string;
  project: string;
}

const SERVERS_FILE = path.join(process.cwd(), 'data', 'worktree-servers.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(SERVERS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
}

// Load servers from JSON file
async function loadServers(): Promise<Record<string, PreviewServer[]>> {
  try {
    const content = await fs.readFile(SERVERS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

// Save servers to JSON file
async function saveServers(servers: Record<string, PreviewServer[]>) {
  await ensureDataDir();
  await fs.writeFile(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

// Check if a process is still running
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Find next available port starting from 3200
async function findAvailablePort(startPort: number = 3200): Promise<number> {
  const servers = await loadServers();
  const usedPorts = new Set();

  Object.values(servers).flat().forEach(server => {
    if (server.status === 'running' || server.status === 'starting') {
      usedPorts.add(server.port);
    }
  });

  let port = startPort;
  while (usedPorts.has(port)) {
    port++;
  }

  return port;
}

// Update server status
async function updateServerStatus(project: string, branch: string, updates: Partial<PreviewServer>) {
  const servers = await loadServers();
  if (!servers[project]) servers[project] = [];

  const serverIndex = servers[project].findIndex(s => s.branch === branch);
  if (serverIndex >= 0) {
    servers[project][serverIndex] = { ...servers[project][serverIndex], ...updates };
    await saveServers(servers);
  }
}

// Clean up stale servers (processes that are no longer running)
async function cleanupStaleServers() {
  const servers = await loadServers();
  let hasChanges = false;

  for (const project in servers) {
    servers[project] = await Promise.all(
      servers[project].map(async (server) => {
        if (server.status === 'running' || server.status === 'starting') {
          const isRunning = await isProcessRunning(server.pid);
          if (!isRunning) {
            hasChanges = true;
            return { ...server, status: 'stopped' as const };
          }
        }
        return server;
      })
    );
  }

  if (hasChanges) {
    await saveServers(servers);
  }
}

// GET /api/git/worktrees/preview?project=<projectId>
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
    await cleanupStaleServers();
    const servers = await loadServers();
    const projectServers = servers[project] || [];

    return NextResponse.json({ servers: projectServers });
  } catch (error) {
    console.error('Error in GET /api/git/worktrees/preview:', error);
    return NextResponse.json(
      { error: 'Failed to list preview servers' },
      { status: 500 }
    );
  }
}

// POST /api/git/worktrees/preview
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project: rawProject, branch, command = 'pnpm dev', port: requestedPort } = body;

    if (!rawProject || !branch) {
      return NextResponse.json(
        { error: 'Project and branch parameters are required' },
        { status: 400 }
      );
    }

    const project = await resolveProjectId(rawProject);

    // Get repository path
    const repoPath = await getRepoPath(project);
    if (!repoPath) {
      return NextResponse.json(
        { error: `Repository not found for project: ${project}` },
        { status: 404 }
      );
    }

    // Get worktree for branch
    const worktree = await getWorktreeForBranch(repoPath, branch);
    if (!worktree) {
      return NextResponse.json(
        { error: `No worktree found for branch: ${branch}` },
        { status: 404 }
      );
    }

    // Check if server is already running
    await cleanupStaleServers();
    const servers = await loadServers();
    if (!servers[project]) servers[project] = [];

    const existingServer = servers[project].find(s => s.branch === branch);
    if (existingServer && (existingServer.status === 'running' || existingServer.status === 'starting')) {
      return NextResponse.json(
        { error: `Preview server already running for branch: ${branch}` },
        { status: 400 }
      );
    }

    // Find available port
    const port = requestedPort || await findAvailablePort();

    // Set up environment with the specified port
    // Extend PATH with common tool locations
    const homeDir = process.env.HOME || '/root';
    const extraPaths = [
      `${homeDir}/flutter/bin`,
      `${homeDir}/.pub-cache/bin`,
      `${homeDir}/.npm-global/bin`,
      `${homeDir}/.local/bin`,
      '/usr/local/bin',
    ].join(':');
    const env = { ...process.env, PORT: port.toString(), HOST: '0.0.0.0', NODE_ENV: 'development', PATH: `${extraPaths}:${process.env.PATH}` };

    // Spawn the dev server process
    const childProcess = spawn('bash', ['-c', command], {
      cwd: worktree.path,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env as NodeJS.ProcessEnv
    });

    if (!childProcess.pid) {
      return NextResponse.json(
        { error: 'Failed to spawn preview server process' },
        { status: 500 }
      );
    }

    // Create server entry
    const server: PreviewServer = {
      branch,
      port,
      pid: childProcess.pid,
      status: 'starting',
      startedAt: new Date().toISOString(),
      command,
      project
    };

    // Remove existing server if any and add new one
    servers[project] = servers[project].filter(s => s.branch !== branch);
    servers[project].push(server);
    await saveServers(servers);

    // Set up process event handlers
    let hasStarted = false;

    // Monitor output for startup success
    childProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (!hasStarted && (output.includes('ready') || output.includes('started') || output.includes('localhost'))) {
        hasStarted = true;
        updateServerStatus(project, branch, { status: 'running' });
      }
    });

    childProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.error(`Preview server stderr [${branch}]:`, output);

      if (!hasStarted && output.includes('Error')) {
        updateServerStatus(project, branch, { status: 'error' });
      }
    });

    childProcess.on('exit', (code) => {
      console.log(`Preview server exited [${branch}] with code:`, code);
      updateServerStatus(project, branch, { status: 'stopped' });
    });

    childProcess.on('error', (error) => {
      console.error(`Preview server error [${branch}]:`, error);
      updateServerStatus(project, branch, { status: 'error' });
    });

    // Mark as running after a short delay if no errors
    setTimeout(() => {
      if (!hasStarted) {
        updateServerStatus(project, branch, { status: 'running' });
      }
    }, 3000);

    return NextResponse.json({
      success: true,
      server: {
        branch,
        port,
        pid: childProcess.pid,
        status: 'starting',
        command
      }
    });
  } catch (error) {
    console.error('Error in POST /api/git/worktrees/preview:', error);
    return NextResponse.json(
      { error: 'Failed to start preview server' },
      { status: 500 }
    );
  }
}

// DELETE /api/git/worktrees/preview
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { project: rawProject2, branch } = body;

    if (!rawProject2 || !branch) {
      return NextResponse.json(
        { error: 'Project and branch parameters are required' },
        { status: 400 }
      );
    }

    const project = await resolveProjectId(rawProject2);
    const servers = await loadServers();
    if (!servers[project]) {
      return NextResponse.json(
        { error: `No servers found for project: ${project}` },
        { status: 404 }
      );
    }

    const server = servers[project].find(s => s.branch === branch);
    if (!server) {
      return NextResponse.json(
        { error: `No preview server found for branch: ${branch}` },
        { status: 404 }
      );
    }

    // Kill the process
    if (server.status === 'running' || server.status === 'starting') {
      try {
        // Kill the process group to ensure all child processes are terminated
        process.kill(-server.pid, 'SIGTERM');
      } catch (error) {
        console.warn(`Failed to kill process group ${server.pid}:`, error);
        // Try killing just the process
        try {
          process.kill(server.pid, 'SIGTERM');
        } catch (killError) {
          console.warn(`Failed to kill process ${server.pid}:`, killError);
        }
      }
    }

    // Update server status
    server.status = 'stopped';
    await saveServers(servers);

    return NextResponse.json({
      success: true,
      message: `Preview server stopped for branch: ${branch}`
    });
  } catch (error) {
    console.error('Error in DELETE /api/git/worktrees/preview:', error);
    return NextResponse.json(
      { error: 'Failed to stop preview server' },
      { status: 500 }
    );
  }
}