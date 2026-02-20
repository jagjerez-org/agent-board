import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/task-store';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface Props {
  params: Promise<{ id: string }>;
}

// Get OpenClaw gateway config
async function getGatewayConfig(): Promise<{ url: string; token: string } | null> {
  try {
    const configPath = join(process.env.HOME || '/root', '.openclaw/openclaw.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const port = config.gateway?.port || 18789;
    const token = config.gateway?.auth?.token;
    if (!token) return null;
    return { url: `http://localhost:${port}`, token };
  } catch {
    return null;
  }
}

// POST /api/tasks/[id]/refine — trigger AI refinement
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const feedback = body.feedback || '';

    const result = await getTask(id);
    if (!result) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { task } = result;
    const gateway = await getGatewayConfig();
    if (!gateway) {
      return NextResponse.json({ error: 'OpenClaw gateway not configured' }, { status: 503 });
    }

    // Build the refinement prompt
    const existingRefinement = task.refinement ? `\n\nPrevious refinement:\n${task.refinement}` : '';
    const feedbackSection = feedback ? `\n\nUser feedback on the refinement:\n${feedback}\n\nPlease update the refinement based on this feedback.` : '';

    const prompt = `You are refining a task for a software development board. Analyze the task and produce a structured refinement document in markdown.

Task: ${task.title}
Description: ${task.description || 'No description'}
Priority: ${task.priority}
Project: ${task.project_id || 'None'}
${existingRefinement}${feedbackSection}

Produce a refinement with these sections (in markdown):
### Summary
Brief clear description of what needs to be done.

### Acceptance Criteria
- [ ] Checkbox list of specific, testable criteria

### Technical Approach
How to implement this — key files, components, patterns.

### Edge Cases
Things to watch out for.

### Estimated Effort
Small / Medium / Large + brief justification.

Reply ONLY with the markdown content, no preamble.`;

    // Call OpenClaw gateway to spawn a sub-agent
    const agentId = task.assignee || 'worker-code';
    const spawnRes = await fetch(`${gateway.url}/api/sessions/spawn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.token}`,
      },
      body: JSON.stringify({
        task: prompt,
        agentId,
        label: `refine-${id}`,
        cleanup: 'delete',
        runTimeoutSeconds: 120,
      }),
    });

    if (!spawnRes.ok) {
      const err = await spawnRes.text();
      console.error('Spawn failed:', err);
      
      // Fallback: mark as pending refinement
      await updateTask(id, {
        refinement: (task.refinement || '') + '\n\n> ⏳ Refinement requested — agent will process shortly.',
      });
      
      return NextResponse.json({ 
        status: 'queued',
        message: 'Refinement queued — agent will process shortly',
      });
    }

    const spawnData = await spawnRes.json();

    // Mark task as refinement in progress
    await updateTask(id, {
      refinement: (feedback && task.refinement ? task.refinement + '\n\n---\n\n' : '') + '> ⏳ Refinement in progress by ' + agentId + '...',
    });

    return NextResponse.json({
      status: 'started',
      sessionKey: spawnData.sessionKey,
      agentId,
    });

  } catch (error: any) {
    console.error('Refine error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
