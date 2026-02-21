import { spawnAgent } from '@/lib/openclaw-api';
import { NextRequest, NextResponse } from 'next/server';
import { getTask, moveTask } from '@/lib/task-store';
import { eventBus } from '@/lib/event-bus';
import { addNotification } from '@/lib/notification-service';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface Props {
  params: Promise<{ id: string }>;
}

const EXEC_DIR = join(process.cwd(), 'data', 'executions');

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

// POST /api/tasks/[id]/execute — queue execution for agent processing
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { task } = result;

    if (!task.refinement || task.refinement.startsWith('> ⏳')) {
      return NextResponse.json({ error: 'Task must be refined before execution' }, { status: 400 });
    }

    // Move to in_progress
    const moved = await moveTask(id, 'in_progress');
    if (moved) {
      eventBus.emit({ type: 'task:moved', payload: moved });
    }

    const agentId = task.assignee || 'worker-code';
    if (!existsSync(EXEC_DIR)) await mkdir(EXEC_DIR, { recursive: true });

    const execPath = join(EXEC_DIR, `${id}.json`);
    const resultPath = join(EXEC_DIR, `${id}-result.md`);

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

    // Write spawning status
    await writeFile(execPath, JSON.stringify({
      status: 'spawning',
      agentId,
      taskId: id,
      startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');

    // Spawn agent directly via OpenClaw HTTP API (same as refine)
    const spawnResult = await spawnAgent({
      task: prompt,
      agentId,
      label: `exec:${id.slice(0, 8)}`,
      timeoutSeconds: 600,
    });

    if (!spawnResult.success) {
      await writeFile(execPath, JSON.stringify({
        status: 'error',
        agentId,
        taskId: id,
        error: spawnResult.error,
        startedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
      return NextResponse.json({ error: spawnResult.error }, { status: 500 });
    }

    // Update status with session key for tracking
    await writeFile(execPath, JSON.stringify({
      status: 'running',
      agentId,
      taskId: id,
      sessionKey: spawnResult.sessionKey,
      startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');

    return NextResponse.json({ status: 'started', agentId, sessionKey: spawnResult.sessionKey });
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

    const moved = await moveTask(id, 'review');
    if (moved) {
      eventBus.emit({ type: 'task:moved', payload: moved });
    }

    const execPath = join(EXEC_DIR, `${id}.json`);
    if (!existsSync(EXEC_DIR)) await mkdir(EXEC_DIR, { recursive: true });
    await writeFile(execPath, JSON.stringify({
      status: 'done',
      agentId: agentId || 'unknown',
      completedAt: new Date().toISOString(),
      summary: summary || 'Completed',
    }), 'utf8');

    await addNotification({
      type: 'execution_done',
      title: `Execution complete: ${result.task.title}`,
      message: summary || `Agent ${agentId || 'unknown'} finished executing "${result.task.title}"`,
      task_id: id,
      agent_id: agentId || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
