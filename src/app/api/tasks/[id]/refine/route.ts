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

// POST /api/tasks/[id]/refine — trigger refinement with chat context
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { task } = result;

    // Get chat history for context
    const chatHistory = await getChatMessages(id);
    const chatContext = chatHistory.map(m => 
      `[${m.role === 'user' ? 'Jose Alejandro' : m.agent_id || 'Agent'}]: ${m.content}${m.images?.length ? ` (${m.images.length} image(s) attached)` : ''}`
    ).join('\n');

    const agentId = task.assignee || 'worker-code';
    const refinePath = join(REFINE_DIR, `${id}.json`);
    const resultPath = join(REFINE_DIR, `${id}.md`);

    // Write status file
    if (!existsSync(REFINE_DIR)) await mkdir(REFINE_DIR, { recursive: true });
    await writeFile(refinePath, JSON.stringify({ status: 'running', agentId, startedAt: new Date().toISOString() }), 'utf8');

    // Add agent "thinking" message to chat
    await addChatMessage(id, {
      id: uuidv4(),
      role: 'agent',
      content: '⏳ Analyzing task and generating refinement...',
      timestamp: new Date().toISOString(),
      agent_id: agentId,
    });

    // Update task with "in progress" marker
    await updateTask(id, {
      refinement: '> ⏳ Refinement in progress...',
    });

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

Also update the task file by reading and updating: ${join(process.cwd(), 'data', 'tasks', `${id}.md`)}
- Update the \`refinement\` field in the YAML frontmatter with the full markdown (use | for multiline).

Be concise and specific. Do all file writes before finishing.`;

    // Write pending status with prompt so heartbeat/wake can pick it up
    await writeFile(refinePath, JSON.stringify({ status: 'pending', agentId, taskId: id, prompt, startedAt: new Date().toISOString() }, null, 2), 'utf8');

    // Send wake event to OpenClaw main session to trigger immediate spawn
    const gateway = await getGatewayConfig();
    if (gateway) {
      try {
        const wakeText = `[Agent Board] Refinement requested for task ${id}. Check /tmp/agent-board/data/refinements/ for pending refinements and spawn agents for them.`;
        await fetch(`${gateway.url}/api/v1/cron/wake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gateway.token}` },
          body: JSON.stringify({ text: wakeText, mode: 'now' }),
        });
      } catch (err: unknown) {
        console.error('Wake event failed (will be picked up by heartbeat):', err);
      }
    }

    return NextResponse.json({ status: 'started', agentId });
  } catch (error: any) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// PUT /api/tasks/[id]/refine — callback to update refinement result (can be called by agent or externally)
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { refinement, agentId } = body;

    if (!refinement) {
      return NextResponse.json({ error: 'refinement content required' }, { status: 400 });
    }

    const result = await getTask(id);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Update the task with refinement
    await updateTask(id, { refinement });

    // Update status file
    const refinePath = join(REFINE_DIR, `${id}.json`);
    if (!existsSync(REFINE_DIR)) await mkdir(REFINE_DIR, { recursive: true });
    await writeFile(refinePath, JSON.stringify({ 
      status: 'done', 
      agentId: agentId || 'unknown',
      completedAt: new Date().toISOString() 
    }), 'utf8');

    // Add completion message to chat
    await addChatMessage(id, {
      id: uuidv4(),
      role: 'agent',
      content: '✅ Refinement complete.',
      timestamp: new Date().toISOString(),
      agent_id: agentId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
