import { getGatewayConfig } from './gateway';

interface SpawnResult {
  success: boolean;
  sessionKey?: string;
  error?: string;
}

/**
 * Spawn a sub-agent session via OpenClaw /tools/invoke HTTP API.
 * This directly creates an isolated session that runs the task.
 * Fully self-contained — no dependency on heartbeat, cron, or main session.
 */
export async function spawnAgent(opts: {
  task: string;
  agentId?: string;
  label?: string;
  timeoutSeconds?: number;
}): Promise<SpawnResult> {
  const gateway = await getGatewayConfig();
  if (!gateway) {
    return { success: false, error: 'Gateway config not found. Run setup first.' };
  }

  try {
    const res = await fetch(`${gateway.url}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.token}`,
      },
      body: JSON.stringify({
        tool: 'sessions_spawn',
        args: {
          task: opts.task,
          agentId: opts.agentId,
          label: opts.label || 'agent-board-task',
          cleanup: 'delete',
          runTimeoutSeconds: opts.timeoutSeconds || 300,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Gateway returned ${res.status}: ${err}` };
    }

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.error?.message || 'Spawn failed' };
    }

    // Extract sessionKey from the tool result
    const resultText = data.result?.content?.[0]?.text || '';
    const sessionKeyMatch = resultText.match(/"sessionKey"\s*:\s*"([^"]+)"/);
    
    return { 
      success: true, 
      sessionKey: sessionKeyMatch?.[1] || data.result?.details?.sessionKey 
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to connect to OpenClaw Gateway' };
  }
}
