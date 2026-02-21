import { spawnAgent } from "@/lib/openclaw-api";
import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/task-store';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  params: Promise<{ id: string }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: string[];
  timestamp: string;
  agent_id?: string;
}

const CHAT_DIR = join(process.cwd(), 'data', 'chats');
const REFINE_DIR = join(process.cwd(), 'data', 'refinements');

async function getChatMessages(taskId: string): Promise<ChatMessage[]> {
  const filePath = join(CHAT_DIR, `${taskId}.json`);
  if (!existsSync(filePath)) return [];
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch { return []; }
}

async function addChatMessage(taskId: string, msg: ChatMessage) {
  if (!existsSync(CHAT_DIR)) await mkdir(CHAT_DIR, { recursive: true });
  const messages = await getChatMessages(taskId);
  messages.push(msg);
  await writeFile(join(CHAT_DIR, `${taskId}.json`), JSON.stringify(messages, null, 2), 'utf8');
}

// GET /api/tasks/[id]/refine — poll refinement status
export async function GET(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const statusFile = join(REFINE_DIR, `${id}.json`);
  
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

// POST /api/tasks/[id]/refine — spawn agent directly via OpenClaw API
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { task } = result;

    const chatHistory = await getChatMessages(id);
    const chatContext = chatHistory
      .filter(m => !m.content.startsWith('⏳') && !m.content.startsWith('✅') && !m.content.startsWith('🔄'))
      .map(m => `[${m.role === 'user' ? 'User' : m.agent_id || 'Agent'}]: ${m.content}`)
      .join('\n');

    const agentId = task.assignee || 'worker-code';
    const refinePath = join(REFINE_DIR, `${id}.json`);
    const resultPath = join(REFINE_DIR, `${id}.md`);
    const taskFilePath = join(process.cwd(), 'data', 'tasks', `${id}.md`);

    if (!existsSync(REFINE_DIR)) await mkdir(REFINE_DIR, { recursive: true });

    // Write spawning status
    await writeFile(refinePath, JSON.stringify({
      status: 'spawning', agentId, taskId: id,
      startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');

    await addChatMessage(id, {
      id: uuidv4(), role: 'agent',
      content: '⏳ Analyzing task and generating refinement...',
      timestamp: new Date().toISOString(), agent_id: agentId,
    });

    await updateTask(id, { refinement: '> ⏳ Refinement in progress...' });

    const prompt = `You are refining a task for the development board.

**Task:** ${task.title}
**Description:** ${task.description || 'No description'}
**Priority:** ${task.priority}
**Project:** ${task.project_id || 'None'}

${task.refinement && !task.refinement.startsWith('>') ? `**Previous Refinement:**\n${task.refinement}\n` : ''}
${chatContext ? `**Conversation:**\n${chatContext}\n` : ''}

Produce a structured refinement in markdown with:
### Summary
### Acceptance Criteria (checkbox list)
### Technical Approach
### Edge Cases
### Estimated Effort

IMPORTANT: After generating the refinement, you MUST save the result by writing to these files:
1. Write the markdown refinement to: ${resultPath}
2. Write this JSON to: ${refinePath}
   {"status":"done","agentId":"${agentId}","completedAt":"<current ISO timestamp>"}
3. Read the task file at ${taskFilePath}, update the \`refinement\` field in YAML frontmatter with the full markdown (use | for multiline), and write it back.

Be concise and specific. Do all file writes before finishing.`;

    // Spawn agent directly via OpenClaw HTTP API
    const spawnResult = await spawnAgent({
      task: prompt,
      agentId,
      label: `refine:${id.slice(0, 8)}`,
      timeoutSeconds: 180,
    });

    if (!spawnResult.success) {
      await writeFile(refinePath, JSON.stringify({
        status: 'error', agentId, taskId: id,
        error: spawnResult.error,
        startedAt: new Date().toISOString(),
      }, null, 2), 'utf8');

      await addChatMessage(id, {
        id: uuidv4(), role: 'agent',
        content: `❌ Failed to spawn agent: ${spawnResult.error}`,
        timestamp: new Date().toISOString(), agent_id: 'system',
      });

      return NextResponse.json({ error: spawnResult.error }, { status: 500 });
    }

    // Update status with session key for tracking
    await writeFile(refinePath, JSON.stringify({
      status: 'running', agentId, taskId: id,
      sessionKey: spawnResult.sessionKey,
      startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');

    return NextResponse.json({ status: 'started', agentId, sessionKey: spawnResult.sessionKey });
  } catch (error: any) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// PUT /api/tasks/[id]/refine — callback to update refinement result
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { refinement, agentId } = body;

    if (!refinement) return NextResponse.json({ error: 'refinement content required' }, { status: 400 });

    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await updateTask(id, { refinement });

    const refinePath = join(REFINE_DIR, `${id}.json`);
    if (!existsSync(REFINE_DIR)) await mkdir(REFINE_DIR, { recursive: true });
    await writeFile(refinePath, JSON.stringify({
      status: 'done', agentId: agentId || 'unknown',
      completedAt: new Date().toISOString()
    }), 'utf8');

    await addChatMessage(id, {
      id: uuidv4(), role: 'agent',
      content: '✅ Refinement complete.',
      timestamp: new Date().toISOString(), agent_id: agentId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
