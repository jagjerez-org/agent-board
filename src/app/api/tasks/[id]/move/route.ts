// POST /api/tasks/[id]/move - Move task to new status column
import { NextRequest, NextResponse } from 'next/server';
import { moveTask } from '@/lib/task-store';
import { eventBus } from '@/lib/event-bus';
import { TaskStatus } from '@/lib/types';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const { status, sort_order } = await request.json();
    
    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    const task = await moveTask(id, status as TaskStatus, sort_order);
    
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    eventBus.emit({ type: 'task:moved', payload: task });
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error moving task:', error);
    
    if (error instanceof Error && error.message.includes('Invalid transition')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to move task' },
      { status: 500 }
    );
  }
}