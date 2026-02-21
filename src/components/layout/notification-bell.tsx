'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  task_id?: string;
  agent_id?: string;
  read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  task_completed: '✅',
  task_failed: '❌',
  refinement_done: '📝',
  execution_done: '⚡',
  pr_created: '🔀',
  info: 'ℹ️',
  warning: '⚠️',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=30');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    fetchNotifications();
  };

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH' });
    fetchNotifications();
  };

  const deleteNotification = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    fetchNotifications();
  };

  const clearAll = async () => {
    await fetch('/api/notifications', { method: 'DELETE' });
    fetchNotifications();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center text-xs px-1 rounded-full"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead} title="Mark all as read">
                  <CheckCheck className="w-4 h-4" />
                </Button>
              )}
              {notifications.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} title="Clear all">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-96">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 flex gap-3 hover:bg-accent/50 transition-colors cursor-pointer ${
                      !n.read ? 'bg-accent/20' : ''
                    }`}
                    onClick={() => !n.read && markAsRead(n.id)}
                  >
                    <span className="text-lg shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm truncate ${!n.read ? 'font-semibold' : ''}`}>
                          {n.title}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                        {n.agent_id && (
                          <span className="text-xs text-muted-foreground">• {n.agent_id}</span>
                        )}
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
