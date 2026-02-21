import { NextRequest, NextResponse } from 'next/server';
import { markAsRead, deleteNotification } from '@/lib/notification-service';

// PATCH /api/notifications/[id] — mark single as read
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await markAsRead(id);
    if (!success) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}

// DELETE /api/notifications/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteNotification(id);
    if (!success) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
