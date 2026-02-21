import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

export interface Notification {
  id: string;
  type: 'task_completed' | 'task_failed' | 'refinement_done' | 'execution_done' | 'pr_created' | 'info' | 'warning';
  title: string;
  message: string;
  task_id?: string;
  agent_id?: string;
  read: boolean;
  created_at: string;
}

interface NotificationsStore {
  notifications: Notification[];
}

async function readStore(): Promise<NotificationsStore> {
  try {
    const content = await fs.readFile(NOTIFICATIONS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { notifications: [] };
  }
}

async function writeStore(store: NotificationsStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Keep only last 100 notifications
  store.notifications = store.notifications.slice(0, 100);
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(store, null, 2));
}

export async function getNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
  const store = await readStore();
  let results = store.notifications;
  if (opts?.unreadOnly) {
    results = results.filter(n => !n.read);
  }
  if (opts?.limit) {
    results = results.slice(0, opts.limit);
  }
  return results;
}

export async function addNotification(input: Omit<Notification, 'id' | 'read' | 'created_at'>): Promise<Notification> {
  const store = await readStore();
  const notification: Notification = {
    ...input,
    id: randomUUID(),
    read: false,
    created_at: new Date().toISOString(),
  };
  store.notifications.unshift(notification);
  await writeStore(store);
  return notification;
}

export async function markAsRead(id: string): Promise<boolean> {
  const store = await readStore();
  const notification = store.notifications.find(n => n.id === id);
  if (!notification) return false;
  notification.read = true;
  await writeStore(store);
  return true;
}

export async function markAllAsRead(): Promise<number> {
  const store = await readStore();
  let count = 0;
  for (const n of store.notifications) {
    if (!n.read) { n.read = true; count++; }
  }
  await writeStore(store);
  return count;
}

export async function deleteNotification(id: string): Promise<boolean> {
  const store = await readStore();
  const idx = store.notifications.findIndex(n => n.id === id);
  if (idx === -1) return false;
  store.notifications.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function clearAll(): Promise<void> {
  await writeStore({ notifications: [] });
}
