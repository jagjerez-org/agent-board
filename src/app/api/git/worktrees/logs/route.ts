import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getRepoPath, getWorktreeForBranch } from '@/lib/worktree-service';
import fs from 'fs/promises';
import path from 'path';

interface LogCommand {
  id: string;
  project: string;
  branch: string;
  command: string;
  pid: number;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  exitCode?: number;
}

const COMMANDS_FILE = path.join(process.cwd(), 'data', 'worktree-commands.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(COMMANDS_FILE);
  await fs.mkdir(dataDir, { recursive: true });
}

// Load commands from JSON file
async function loadCommands(): Promise<LogCommand[]> {
  try {
    const content = await fs.readFile(COMMANDS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

// Save commands to JSON file
async function saveCommands(commands: LogCommand[]) {
  await ensureDataDir();
  await fs.writeFile(COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

// Global log service instance
class LogService {
  private static instance: LogService;
  private processes: Map<string, {
    process: any;
    buffer: string[];
    subscribers: Set<ReadableStreamDefaultController>;
    command: LogCommand;
  }> = new Map();

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  private getProcessKey(project: string, branch: string, commandId?: string): string {
    return commandId ? `${project}:${branch}:${commandId}` : `${project}:${branch}:preview`;
  }

  addProcess(key: string, process: any, command: LogCommand) {
    const processData = {
      process,
      buffer: [] as string[],
      subscribers: new Set<ReadableStreamDefaultController>(),
      command
    };

    this.processes.set(key, processData);

    // Handle stdout
    process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        const logEntry = `${new Date().toISOString()} [OUT] ${line}`;
        processData.buffer.push(logEntry);
        
        // Keep only last 1000 lines
        if (processData.buffer.length > 1000) {
          processData.buffer.shift();
        }
        
        // Send to subscribers
        processData.subscribers.forEach(controller => {
          try {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stdout', message: line, timestamp: new Date().toISOString() })}\n\n`));
          } catch (error) {
            console.warn('Error sending to subscriber:', error);
          }
        });
      });
    });

    // Handle stderr
    process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(line => {
        const logEntry = `${new Date().toISOString()} [ERR] ${line}`;
        processData.buffer.push(logEntry);
        
        // Keep only last 1000 lines
        if (processData.buffer.length > 1000) {
          processData.buffer.shift();
        }
        
        // Send to subscribers
        processData.subscribers.forEach(controller => {
          try {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stderr', message: line, timestamp: new Date().toISOString() })}\n\n`));
          } catch (error) {
            console.warn('Error sending to subscriber:', error);
          }
        });
      });
    });

    // Handle process exit
    process.on('exit', (code: number) => {
      processData.command.status = 'completed';
      processData.command.exitCode = code;
      
      const exitMessage = `Process exited with code ${code}`;
      const logEntry = `${new Date().toISOString()} [SYS] ${exitMessage}`;
      processData.buffer.push(logEntry);
      
      // Notify subscribers
      processData.subscribers.forEach(controller => {
        try {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'system', message: exitMessage, timestamp: new Date().toISOString(), exitCode: code })}\n\n`));
        } catch (error) {
          console.warn('Error sending exit notification:', error);
        }
      });

      // Update commands file
      this.updateCommand(processData.command);
    });

    // Handle process error
    process.on('error', (error: Error) => {
      processData.command.status = 'error';
      
      const errorMessage = `Process error: ${error.message}`;
      const logEntry = `${new Date().toISOString()} [ERR] ${errorMessage}`;
      processData.buffer.push(logEntry);
      
      // Notify subscribers
      processData.subscribers.forEach(controller => {
        try {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage, timestamp: new Date().toISOString() })}\n\n`));
        } catch (error) {
          console.warn('Error sending error notification:', error);
        }
      });

      // Update commands file
      this.updateCommand(processData.command);
    });

    return processData;
  }

  subscribe(key: string): ReadableStream<Uint8Array> {
    const processData = this.processes.get(key);
    let currentController: ReadableStreamDefaultController<Uint8Array> | null = null;
    
    return new ReadableStream({
      start(controller) {
        currentController = controller;
        
        if (processData) {
          // Send existing buffer
          processData.buffer.forEach(line => {
            const [timestamp, levelAndMessage] = line.split(' ', 2);
            const level = levelAndMessage.slice(1, 4);
            const message = levelAndMessage.slice(5);
            
            let type = 'stdout';
            if (level === 'ERR') type = 'stderr';
            else if (level === 'SYS') type = 'system';
            
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, message, timestamp })}\n\n`));
          });
          
          // Add to subscribers
          processData.subscribers.add(controller);
        } else {
          // No process found, send error
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Process not found', timestamp: new Date().toISOString() })}\n\n`));
        }
      },
      cancel() {
        // Remove from subscribers
        if (processData && currentController) {
          processData.subscribers.delete(currentController);
        }
      }
    });
  }

  getBuffer(key: string): string[] {
    const processData = this.processes.get(key);
    return processData?.buffer || [];
  }

  private async updateCommand(command: LogCommand) {
    try {
      const commands = await loadCommands();
      const index = commands.findIndex(c => c.id === command.id);
      if (index >= 0) {
        commands[index] = command;
        await saveCommands(commands);
      }
    } catch (error) {
      console.error('Error updating command:', error);
    }
  }

  // Find preview server process from the preview API
  async findPreviewProcess(project: string, branch: string) {
    try {
      const serversFile = path.join(process.cwd(), 'data', 'worktree-servers.json');
      const content = await fs.readFile(serversFile, 'utf8');
      const servers = JSON.parse(content);
      const server = servers[project]?.find((s: any) => s.branch === branch && s.status === 'running');
      return server;
    } catch (error) {
      return null;
    }
  }
}

const logService = LogService.getInstance();

// GET /api/git/worktrees/logs - Stream logs via SSE
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get('project');
    const branch = searchParams.get('branch');
    const commandId = searchParams.get('commandId');
    
    if (!project || !branch) {
      return NextResponse.json(
        { error: 'Project and branch parameters are required' },
        { status: 400 }
      );
    }

    const key = logService['getProcessKey'](project, branch, commandId || undefined);
    const stream = logService.subscribe(key);
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/git/worktrees/logs:', error);
    return NextResponse.json(
      { error: 'Failed to stream logs' },
      { status: 500 }
    );
  }
}

// POST /api/git/worktrees/logs - Run a command and stream output
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project, branch, command } = body;
    
    if (!project || !branch || !command) {
      return NextResponse.json(
        { error: 'Project, branch, and command parameters are required' },
        { status: 400 }
      );
    }
    
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
    
    // Generate command ID
    const commandId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create command entry
    const logCommand: LogCommand = {
      id: commandId,
      project,
      branch,
      command,
      pid: 0, // Will be set after spawn
      status: 'running',
      startedAt: new Date().toISOString()
    };
    
    // Spawn the command
    const childProcess = spawn('bash', ['-c', command], {
      cwd: worktree.path,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    
    if (!childProcess.pid) {
      return NextResponse.json(
        { error: 'Failed to spawn command process' },
        { status: 500 }
      );
    }
    
    logCommand.pid = childProcess.pid;
    
    // Save command
    const commands = await loadCommands();
    commands.push(logCommand);
    await saveCommands(commands);
    
    // Add to log service
    const key = logService['getProcessKey'](project, branch, commandId);
    logService.addProcess(key, childProcess, logCommand);
    
    return NextResponse.json({
      success: true,
      commandId,
      message: `Command started: ${command}`
    });
  } catch (error) {
    console.error('Error in POST /api/git/worktrees/logs:', error);
    return NextResponse.json(
      { error: 'Failed to start command' },
      { status: 500 }
    );
  }
}