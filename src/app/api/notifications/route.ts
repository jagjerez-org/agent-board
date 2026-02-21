import { NextRequest, NextResponse } from 'next/server';
import {
  getNotifications,
  addNotification,
  markAllAsRead,
  clearAll,
} from '@/lib/notification-service';

// GET /api/notifications?unreadOnly=true&limit=50
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const unreadOnly = params.get('unreadOnly') === 'true';
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 50;

    const notifications = await getNotifications({ unreadOnly, limit });
    const allNotifications = await getNotifications({});
    const unreadCount = allNotifications.filter(n => !n.read).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, message, task_id, agent_id } = body;

    if (!type || !title || !message) {
      return NextResponse.json({ error: 'type, title, and message are required' }, { status: 400 });
    }

    const notification = await addNotification({ type, title, message, task_id, agent_id });
    return NextResponse.json({ notification });
  } catch (error) {
    console.error('Error creating notification:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
  try {
    const count = await markAllAsRead();
    return NextResponse.json({ success: true, marked: count });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}

// DELETE /api/notifications — clear all
export async function DELETE() {
  try {
    await clearAll();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
  }
}
