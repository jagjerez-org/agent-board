// POST /api/tasks/[id]/comments - Add comment to task
import { NextRequest, NextResponse } from 'next/server';
import { addComment } from '@/lib/task-store';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const { author, content } = await request.json();
    
    if (!author || typeof author !== 'string') {
      return NextResponse.json(
        { error: 'Author is required' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const comment = await addComment(id, author, content);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error adding comment:', error);
    
    if (error instanceof Error && error.message === 'Task not found') {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}