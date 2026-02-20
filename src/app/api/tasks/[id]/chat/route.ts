import { NextRequest, NextResponse } from 'next/server';
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
  images?: string[]; // relative paths to uploaded images
  timestamp: string;
  agent_id?: string;
}

const CHAT_DIR = join(process.cwd(), 'data', 'chats');

async function ensureChatDir() {
  if (!existsSync(CHAT_DIR)) await mkdir(CHAT_DIR, { recursive: true });
}

async function getChatMessages(taskId: string): Promise<ChatMessage[]> {
  await ensureChatDir();
  const filePath = join(CHAT_DIR, `${taskId}.json`);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch { return []; }
}

async function saveChatMessages(taskId: string, messages: ChatMessage[]) {
  await ensureChatDir();
  const filePath = join(CHAT_DIR, `${taskId}.json`);
  await writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
}

// GET /api/tasks/[id]/chat — get chat messages
export async function GET(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const messages = await getChatMessages(id);
  return NextResponse.json({ messages });
}

// POST /api/tasks/[id]/chat — add a message
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, role = 'user', images, agent_id } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    const messages = await getChatMessages(id);
    const newMessage: ChatMessage = {
      id: uuidv4(),
      role,
      content: content.trim(),
      images: images || undefined,
      timestamp: new Date().toISOString(),
      agent_id: agent_id || undefined,
    };

    messages.push(newMessage);
    await saveChatMessages(id, messages);

    return NextResponse.json({ message: newMessage });
  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
