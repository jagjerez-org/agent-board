// GET /api/tasks - List tasks with filters
// POST /api/tasks - Create new task
import { NextRequest, NextResponse } from 'next/server';
import { listTasks, createTask, getTasksByStatus } from '@/lib/task-store';
import { TaskStatus, Priority } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as TaskStatus | null;
    const assignee = searchParams.get('assignee') || undefined;
    const priority = searchParams.get('priority') as Priority | null;
    const labels = searchParams.get('labels')?.split(',').filter(Boolean) || undefined;
    const groupBy = searchParams.get('groupBy');

    if (groupBy === 'status') {
      // Return tasks grouped by status for kanban board
      const tasksByStatus = await getTasksByStatus();
      return NextResponse.json(tasksByStatus);
    }

    // Regular filtered list
    const filters = {
      status: status || undefined,
      assignee,
      priority: priority || undefined,
      labels
    };

    const tasks = await listTasks(filters);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.title || typeof data.title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required and must be a string' },
        { status: 400 }
      );
    }

    const task = await createTask(data);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}