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

    const prompt = `Refine this task for the development board. 

**Task:** ${task.title}
**Description:** ${task.description || 'No description'}
**Priority:** ${task.priority}
**Project:** ${task.project_id || 'None'}

${task.refinement ? `**Previous Refinement:**\n${task.refinement}\n` : ''}
${chatContext ? `**Conversation:**\n${chatContext}\n` : ''}

Produce a structured refinement in markdown with:
### Summary
### Acceptance Criteria (checkbox list)
### Technical Approach
### Edge Cases
### Estimated Effort

Reply ONLY with the markdown. Be concise and specific.`;

    const agentId = task.assignee || 'worker-code';

    // Add agent "thinking" message
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

    // Try to spawn via OpenClaw (non-blocking)
    const gateway = await getGatewayConfig();
    if (gateway) {
      // Fire and forget — the agent will update the task when done
      fetch(`${gateway.url}/api/v1/sessions/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gateway.token}` },
        body: JSON.stringify({
          message: prompt,
          label: `refine-task-${id}`,
          agentId,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ status: 'started', agentId });
  } catch (error: any) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
