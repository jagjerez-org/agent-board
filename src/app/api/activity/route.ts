// GET /api/activity - Global activity feed
import { NextRequest, NextResponse } from 'next/server';
import { getActivity, getActivityTimeline } from '@/lib/activity-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const taskId = searchParams.get('taskId') || undefined;
    const agentId = searchParams.get('agentId') || undefined;
    const format = searchParams.get('format');

    if (format === 'timeline') {
      const timeline = await getActivityTimeline(limit);
      return NextResponse.json(timeline);
    }

    const activities = await getActivity({
      limit,
      offset,
      taskId,
      agentId
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}