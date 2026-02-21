import { NextRequest, NextResponse } from 'next/server';
import { addNotification } from '@/lib/notification-service';

// POST /api/notifications/webhook
// Called when agent tasks complete (refinement, execution, etc.)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, task_id, task_title, agent_id, success, message } = body;

    if (!event) {
      return NextResponse.json({ error: 'event is required' }, { status: 400 });
    }

    const typeMap: Record<string, string> = {
      'refinement.completed': 'refinement_done',
      'refinement.failed': 'task_failed',
      'execution.completed': 'execution_done',
      'execution.failed': 'task_failed',
      'task.completed': 'task_completed',
      'pr.created': 'pr_created',
    };

    const titleMap: Record<string, string> = {
      'refinement.completed': `Refinement complete: ${task_title || task_id}`,
      'refinement.failed': `Refinement failed: ${task_title || task_id}`,
      'execution.completed': `Execution complete: ${task_title || task_id}`,
      'execution.failed': `Execution failed: ${task_title || task_id}`,
      'task.completed': `Task done: ${task_title || task_id}`,
      'pr.created': `PR created: ${task_title || task_id}`,
    };

    const type = (typeMap[event] || 'info') as 'refinement_done' | 'task_failed' | 'execution_done' | 'task_completed' | 'pr_created' | 'info';

    const notification = await addNotification({
      type,
      title: titleMap[event] || event,
      message: message || `Agent ${agent_id || 'unknown'} finished ${event} for task ${task_title || task_id || 'unknown'}`,
      task_id,
      agent_id,
    });

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}
