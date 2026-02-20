import { getGatewayConfig } from "@/lib/gateway";
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';


// POST /api/bridge/spawn — send a wake event to OpenClaw that triggers a spawn
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, agentId, label, taskId } = body;

    if (!task) {
      return NextResponse.json({ error: 'task prompt required' }, { status: 400 });
    }

    const gateway = await getGatewayConfig();
    if (!gateway) {
      return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
    }

    // Use the cron wake endpoint to inject a system event into the main session
    // The main agent (Jarvis) will see this and use sessions_spawn
    const wakeText = JSON.stringify({
      type: 'agent-board-refine',
      taskId,
      label,
      agentId,
      task,
    });

    const res = await fetch(`${gateway.url}/api/v1/cron/wake`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${gateway.token}` 
      },
      body: JSON.stringify({ text: wakeText, mode: 'now' }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Gateway error: ${err}` }, { status: 502 });
    }

    return NextResponse.json({ status: 'wake_sent' });
  } catch (error: any) {
    console.error('Bridge spawn error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
