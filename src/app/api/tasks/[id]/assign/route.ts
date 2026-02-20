// POST /api/tasks/[id]/assign - Assign task to agent
import { NextRequest, NextResponse } from 'next/server';
import { assignTask } from '@/lib/task-store';
import { assignAgentToTask } from '@/lib/agent-store';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const { agentId } = await request.json();
    
    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    // Update task assignment
    const task = await assignTask(id, agentId);
    
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Update agent status
    const agent = await assignAgentToTask(agentId, id);
    
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ task, agent });
  } catch (error) {
    console.error('Error assigning task:', error);
    return NextResponse.json(
      { error: 'Failed to assign task' },
      { status: 500 }
    );
  }
}