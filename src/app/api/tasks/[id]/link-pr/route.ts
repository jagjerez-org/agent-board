// POST /api/tasks/[id]/link-pr - Link GitHub PR to task
import { NextRequest, NextResponse } from 'next/server';
import { linkPR } from '@/lib/task-store';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const { prUrl } = await request.json();
    
    if (!prUrl || typeof prUrl !== 'string') {
      return NextResponse.json(
        { error: 'PR URL is required' },
        { status: 400 }
      );
    }

    // Basic URL validation
    if (!prUrl.includes('github.com') || !prUrl.includes('/pull/')) {
      return NextResponse.json(
        { error: 'Invalid GitHub PR URL' },
        { status: 400 }
      );
    }

    const task = await linkPR(id, prUrl);
    
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error linking PR:', error);
    return NextResponse.json(
      { error: 'Failed to link PR' },
      { status: 500 }
    );
  }
}