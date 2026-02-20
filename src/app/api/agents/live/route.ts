// GET /api/agents/live — Real-time agent status from OpenClaw session stores
import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

const OPENCLAW_DIR = '/home/jarvis/.openclaw';
const AGENTS_DIR = join(OPENCLAW_DIR, 'agents');

interface ActiveSession {
  key: string;
  label?: string;
  task?: string;
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
  isSubagent: boolean;
  sessionId?: string;
}

interface LiveAgent {
  id: string;
  status: 'idle' | 'busy' | 'offline';
  model?: string;
  totalTokens?: number;
  updatedAt?: number;
  activeSessions: ActiveSession[];
  activeSubagents: {
    id: string;
    label: string;
    model?: string;
    task?: string;
    status: 'running' | 'done';
    updatedAt?: number;
    totalTokens?: number;
    parentAgent: string;
  }[];
}

export async function GET() {
  try {
    const agentDirs = await readdir(AGENTS_DIR).catch(() => []);
    const agents: LiveAgent[] = [];
    const now = Date.now();

    for (const dirName of agentDirs) {
      if (dirName === 'main') continue;
      
      const sessionsPath = join(AGENTS_DIR, dirName, 'sessions', 'sessions.json');
      let sessionsData: Record<string, Record<string, unknown>> = {};
      
      try {
        const raw = await readFile(sessionsPath, 'utf-8');
        sessionsData = JSON.parse(raw);
      } catch { /* No sessions file */ }

      const entries = Object.entries(sessionsData);
      const activeSessions: ActiveSession[] = entries.map(([key, session]) => ({
        key,
        label: session.label as string | undefined,
        task: session.task as string | undefined,
        model: session.model as string | undefined,
        totalTokens: session.totalTokens as number | undefined,
        updatedAt: session.updatedAt as number | undefined,
        isSubagent: key.includes('subagent'),
        sessionId: session.sessionId as string | undefined,
      }));

      // Agent is "busy" if any session updated in last 2 minutes
      const recentThreshold = 2 * 60 * 1000;
      const hasRecentActivity = activeSessions.some(
        s => s.updatedAt && (now - s.updatedAt) < recentThreshold
      );

      const mainSession = activeSessions.find(s => !s.isSubagent);
      
      // Active subagent sessions (updated in last 30 minutes = likely still relevant)
      const subagentSessions = activeSessions.filter(s => s.isSubagent);
      const activeSubagents = subagentSessions.map(s => {
        const isRunning = s.updatedAt ? (now - s.updatedAt) < recentThreshold : false;
        return {
          id: s.key,
          label: s.label || s.key.split(':').pop()?.slice(0, 8) || 'unknown',
          model: s.model,
          task: s.task,
          status: isRunning ? 'running' as const : 'done' as const,
          updatedAt: s.updatedAt,
          totalTokens: s.totalTokens,
          parentAgent: dirName,
        };
      });

      agents.push({
        id: dirName,
        status: hasRecentActivity ? 'busy' : 'idle',
        model: mainSession?.model,
        totalTokens: mainSession?.totalTokens,
        updatedAt: mainSession?.updatedAt,
        activeSessions,
        activeSubagents: activeSubagents.filter(s => 
          // Show running ones always, done ones only if recent (last 30min)
          s.status === 'running' || (s.updatedAt && (now - s.updatedAt) < 30 * 60 * 1000)
        ),
      });
    }

    return NextResponse.json({ agents, timestamp: now });
  } catch (error) {
    console.error('Error reading live agent status:', error);
    return NextResponse.json({ error: 'Failed to read agent status' }, { status: 500 });
  }
}
