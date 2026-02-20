// POST /api/tasks/[id]/execute — auto-execute a refined task
// Moves task to in_progress, spawns agent work, on completion moves to review
import { NextRequest, NextResponse } from 'next/server';
import { getTask, moveTask, updateTask } from '@/lib/task-store';
import { eventBus } from '@/lib/event-bus';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  params: Promise<{ id: string }>;
}

const EXEC_DIR = join(process.cwd(), 'data', 'executions');

async function getGatewayConfig(): Promise<{ url: string; token: string } | null> {
  try {
    const configPath = join(process.env.HOME || '/root', '.openclaw/openclaw.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token;
    if (!token) return null;
    return { url: `http://localhost:${port}`, token };
  } catch { return null; }
}

// GET /api/tasks/[id]/execute — poll execution status
export async function GET(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const statusFile = join(EXEC_DIR, `${id}.json`);

  if (!existsSync(statusFile)) {
    return NextResponse.json({ status: 'idle' });
  }

  try {
    const data = JSON.parse(await readFile(statusFile, 'utf8'));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 'idle' });
  }
}

// POST /api/tasks/[id]/execute — trigger execution
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { task } = result;

    if (!task.refinement || task.refinement.startsWith('> ⏳')) {
      return NextResponse.json({ error: 'Task must be refined before execution' }, { status: 400 });
    }

    // Move to in_progress immediately
    const moved = await moveTask(id, 'in_progress');
    if (moved) {
      eventBus.emit({ type: 'task:moved', payload: moved });
    }

    const agentId = task.assignee || 'worker-code';
    if (!existsSync(EXEC_DIR)) await mkdir(EXEC_DIR, { recursive: true });

    const execPath = join(EXEC_DIR, `${id}.json`);
    const resultPath = join(EXEC_DIR, `${id}-result.md`);

    // Build the execution prompt
    const prompt = `You are executing a development task. Complete the implementation as described.

**Task:** ${task.title}
**Project:** ${task.project_id || 'Unknown'}
**Priority:** ${task.priority}
**Branch:** ${task.branch || 'None assigned'}

**Refinement / Requirements:**
${task.refinement}

${task.description ? `**Original Description:**\n${task.description}\n` : ''}

## Instructions
1. Implement the task according to the refinement/requirements above
2. Write clean, well-structured code following project conventions
3. Run tests/linting if applicable
4. When done, write a summary of changes to: ${resultPath}
5. Update the execution status by writing this JSON to: ${execPath}
   {"status":"done","agentId":"${agentId}","completedAt":"<current ISO timestamp>","summary":"<brief summary>"}

Complete all work and file writes before finishing.`;

    // Spawn agent directly via OpenClaw gateway
    const gateway = await getGatewayConfig();
    if (!gateway) {
      // Fallback to pending file for heartbeat pickup
      await writeFile(execPath, JSON.stringify({
        status: 'pending',
        agentId,
        taskId: id,
        prompt,
        startedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
      return NextResponse.json({ status: 'started', agentId, note: 'Gateway not available, queued for heartbeat' });
    }

    try {
      const spawnRes = await fetch(`${gateway.url}/api/sessions/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gateway.token}`,
        },
        body: JSON.stringify({
          task: prompt,
          agentId,
          label: `exec-${id.slice(0, 8)}`,
        }),
      });

      if (!spawnRes.ok) {
        throw new Error(`Gateway spawn failed: ${spawnRes.status}`);
      }

      const spawnData = await spawnRes.json();

      await writeFile(execPath, JSON.stringify({
        status: 'spawned',
        agentId,
        taskId: id,
        prompt,
        startedAt: new Date().toISOString(),
        spawnedAt: new Date().toISOString(),
        sessionKey: spawnData.childSessionKey || null,
      }, null, 2), 'utf8');

      return NextResponse.json({ status: 'spawned', agentId, sessionKey: spawnData.childSessionKey });
    } catch (spawnErr: any) {
      console.error('Direct spawn failed, falling back to pending:', spawnErr.message);
      await writeFile(execPath, JSON.stringify({
        status: 'pending',
        agentId,
        taskId: id,
        prompt,
        startedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
      return NextResponse.json({ status: 'started', agentId, note: 'Queued for heartbeat (direct spawn failed)' });
    }
  } catch (error: any) {
    console.error('Execute error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// PUT /api/tasks/[id]/execute — callback when execution completes
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { summary, agentId } = body;

    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Move to review
    const moved = await moveTask(id, 'review');
    if (moved) {
      eventBus.emit({ type: 'task:moved', payload: moved });
    }

    // Update execution status
    const execPath = join(EXEC_DIR, `${id}.json`);
    if (!existsSync(EXEC_DIR)) await mkdir(EXEC_DIR, { recursive: true });
    await writeFile(execPath, JSON.stringify({
      status: 'done',
      agentId: agentId || 'unknown',
      completedAt: new Date().toISOString(),
      summary: summary || 'Completed',
    }), 'utf8');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
