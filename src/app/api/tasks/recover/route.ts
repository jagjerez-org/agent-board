import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const REFINE_DIR = join(process.cwd(), 'data', 'refinements');
const EXEC_DIR = join(process.cwd(), 'data', 'executions');
const CHAT_DIR = join(process.cwd(), 'data', 'chats');

interface TaskStatus {
  status: string;
  agentId?: string;
  startedAt?: string;
  taskId?: string;
  completedAt?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: string[];
  timestamp: string;
  agent_id?: string;
}

async function addChatMessage(taskId: string, msg: ChatMessage) {
  if (!existsSync(CHAT_DIR)) return; // Skip if no chat dir
  try {
    const filePath = join(CHAT_DIR, `${taskId}.json`);
    let messages: ChatMessage[] = [];
    if (existsSync(filePath)) {
      messages = JSON.parse(await readFile(filePath, 'utf8'));
    }
    messages.push(msg);
    await writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
  } catch {
    // Ignore errors for chat messages
  }
}

async function scanStuckTasks(): Promise<{ taskId: string; type: 'refinement' | 'execution'; status: TaskStatus; filePath: string }[]> {
  const stuckTasks: { taskId: string; type: 'refinement' | 'execution'; status: TaskStatus; filePath: string }[] = [];
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

  // Check refinements
  if (existsSync(REFINE_DIR)) {
    try {
      const files = await readdir(REFINE_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const taskId = file.replace('.json', '');
        const filePath = join(REFINE_DIR, file);
        
        try {
          const data: TaskStatus = JSON.parse(await readFile(filePath, 'utf8'));
          if (['pending', 'spawned', 'running'].includes(data.status)) {
            const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
            if (startedAt > 0 && startedAt < fiveMinutesAgo) {
              stuckTasks.push({ taskId, type: 'refinement', status: data, filePath });
            }
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Skip if directory can't be read
    }
  }

  // Check executions
  if (existsSync(EXEC_DIR)) {
    try {
      const files = await readdir(EXEC_DIR);
      for (const file of files) {
        if (!file.endsWith('.json') || file.includes('-result.md')) continue;
        const taskId = file.replace('.json', '');
        const filePath = join(EXEC_DIR, file);
        
        try {
          const data: TaskStatus = JSON.parse(await readFile(filePath, 'utf8'));
          if (['pending', 'spawned', 'running'].includes(data.status)) {
            const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
            if (startedAt > 0 && startedAt < fiveMinutesAgo) {
              stuckTasks.push({ taskId, type: 'execution', status: data, filePath });
            }
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Skip if directory can't be read
    }
  }

  return stuckTasks;
}

// GET /api/tasks/recover - List stuck tasks without recovering them
export async function GET() {
  try {
    const stuckTasks = await scanStuckTasks();
    return NextResponse.json({ 
      stuckTasks: stuckTasks.map(t => ({
        taskId: t.taskId,
        type: t.type,
        status: t.status.status,
        agentId: t.status.agentId,
        startedAt: t.status.startedAt
      }))
    });
  } catch (error: any) {
    console.error('Recovery scan error:', error);
    return NextResponse.json({ error: error.message || 'Failed to scan stuck tasks' }, { status: 500 });
  }
}

// POST /api/tasks/recover - Recover stuck tasks
export async function POST() {
  try {
    const stuckTasks = await scanStuckTasks();
    const recovered: { taskId: string; type: 'refinement' | 'execution'; previousStatus: string }[] = [];

    for (const task of stuckTasks) {
      try {
        // Reset status to pending (so heartbeat picks them up again)
        const newStatus: TaskStatus = {
          ...task.status,
          status: 'pending',
          // Keep original startedAt for reference, but agents will update when they start
        };

        await writeFile(task.filePath, JSON.stringify(newStatus, null, 2), 'utf8');

        // Add recovery chat message
        await addChatMessage(task.taskId, {
          id: uuidv4(),
          role: 'agent',
          content: `🔄 Task recovered from stuck "${task.status.status}" status after 5+ minutes. Re-queued for processing.`,
          timestamp: new Date().toISOString(),
          agent_id: 'system',
        });

        recovered.push({
          taskId: task.taskId,
          type: task.type,
          previousStatus: task.status.status
        });
      } catch (err) {
        console.error(`Failed to recover task ${task.taskId}:`, err);
        // Continue with other tasks
      }
    }

    return NextResponse.json({ 
      recoveredTasks: recovered,
      message: recovered.length > 0 
        ? `Recovered ${recovered.length} stuck tasks` 
        : 'No stuck tasks found'
    });
  } catch (error: any) {
    console.error('Recovery error:', error);
    return NextResponse.json({ error: error.message || 'Failed to recover tasks' }, { status: 500 });
  }
}