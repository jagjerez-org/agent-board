// GET /api/agents/[id]/logs — Read recent transcript entries for an agent
import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { stat } from 'fs/promises';

const OPENCLAW_DIR = '/home/jarvis/.openclaw';
const AGENTS_DIR = join(OPENCLAW_DIR, 'agents');

interface Props {
  params: Promise<{ id: string }>;
}

interface LogEntry {
  timestamp: string;
  role?: string;
  type: string;
  content?: string;
  toolName?: string;
  sessionKey?: string;
  label?: string;
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const sessionKey = searchParams.get('session'); // optional: specific session

    // Validate agent exists
    const agentDir = join(AGENTS_DIR, id);
    const sessionsDir = join(agentDir, 'sessions');

    // Find transcript files
    const files = await readdir(sessionsDir).catch(() => []);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return NextResponse.json({ logs: [], agent: id });
    }

    // If specific session requested, find that file
    let targetFiles = jsonlFiles;
    if (sessionKey) {
      // sessionKey format: agent:worker-heavy:subagent:UUID
      // file is named by sessionId (UUID.jsonl)
      // Read sessions.json to find the sessionId
      const sessionsPath = join(sessionsDir, 'sessions.json');
      try {
        const raw = await readFile(sessionsPath, 'utf-8');
        const sessions = JSON.parse(raw) as Record<string, Record<string, unknown>>;
        const session = sessions[sessionKey];
        if (session?.sessionId) {
          const fname = `${session.sessionId}.jsonl`;
          if (jsonlFiles.includes(fname)) {
            targetFiles = [fname];
          }
        }
      } catch { /* ignore */ }
    }

    // Sort files by modification time (most recent first)
    const fileStats = await Promise.all(
      targetFiles.map(async (f) => {
        const s = await stat(join(sessionsDir, f)).catch(() => null);
        return { file: f, mtime: s?.mtimeMs || 0 };
      })
    );
    fileStats.sort((a, b) => b.mtime - a.mtime);

    // Read from most recent file(s)
    const logs: LogEntry[] = [];
    
    // Get session labels from sessions.json
    const sessionsPath = join(sessionsDir, 'sessions.json');
    const sessionLabels: Record<string, string> = {};
    try {
      const raw = await readFile(sessionsPath, 'utf-8');
      const sessions = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [key, session] of Object.entries(sessions)) {
        if (session.sessionId && session.label) {
          sessionLabels[session.sessionId as string] = session.label as string;
        }
        // Also map by key for lookup
        if (session.sessionId) {
          sessionLabels[session.sessionId as string] = (session.label as string) || key.split(':').pop() || key;
        }
      }
    } catch { /* ignore */ }

    for (const { file } of fileStats.slice(0, 3)) { // max 3 files
      try {
        const content = await readFile(join(sessionsDir, file), 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        const sessionId = file.replace('.jsonl', '');
        const label = sessionLabels[sessionId] || sessionId.slice(0, 8);
        
        // Take last N lines
        const relevantLines = lines.slice(-limit);
        
        for (const line of relevantLines) {
          try {
            const entry = JSON.parse(line);
            
            if (entry.type === 'message' && entry.message) {
              const msg = entry.message;
              let content = '';
              
              if (typeof msg.content === 'string') {
                content = msg.content.slice(0, 500);
              } else if (Array.isArray(msg.content)) {
                // Extract text parts
                for (const part of msg.content) {
                  if (part.type === 'text') {
                    content += part.text?.slice(0, 300) || '';
                  } else if (part.type === 'toolCall') {
                    content += `[tool: ${part.name}(${JSON.stringify(part.arguments || {}).slice(0, 100)})]`;
                  } else if (part.type === 'toolResult') {
                    content += `[result: ${JSON.stringify(part.content || '').slice(0, 100)}]`;
                  }
                }
              }

              logs.push({
                timestamp: entry.timestamp || new Date().toISOString(),
                role: msg.role,
                type: 'message',
                content: content.slice(0, 500),
                toolName: Array.isArray(msg.content) ? msg.content.find((p: Record<string, unknown>) => p.type === 'toolCall')?.name : undefined,
                sessionKey: `session:${sessionId}`,
                label,
              });
            } else if (entry.type === 'custom') {
              logs.push({
                timestamp: entry.timestamp || new Date().toISOString(),
                type: entry.customType || 'custom',
                content: JSON.stringify(entry.data || {}).slice(0, 200),
                sessionKey: `session:${sessionId}`,
                label,
              });
            }
          } catch { /* skip bad lines */ }
        }
      } catch { /* skip unreadable files */ }
    }

    // Sort by timestamp, take last N
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const finalLogs = logs.slice(-limit);

    return NextResponse.json({ logs: finalLogs, agent: id });
  } catch (error) {
    console.error('Error reading agent logs:', error);
    return NextResponse.json({ error: 'Failed to read logs' }, { status: 500 });
  }
}
