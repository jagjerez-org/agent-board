/**
 * Simple in-memory event bus for SSE broadcasting.
 * When any API mutation happens, it emits an event here.
 * Connected SSE clients receive the update instantly.
 */

export type BoardEvent = {
  type: 'task:created' | 'task:updated' | 'task:moved' | 'task:deleted' | 'task:commented' | 'task:assigned' | 'agent:updated' | 'board:refresh';
  payload?: unknown;
  timestamp: string;
};

type Listener = (event: BoardEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: Omit<BoardEvent, 'timestamp'>) {
    const full: BoardEvent = { ...event, timestamp: new Date().toISOString() };
    for (const listener of this.listeners) {
      try { listener(full); } catch { /* don't break other listeners */ }
    }
  }

  get connectionCount() {
    return this.listeners.size;
  }
}

// Singleton — shared across all API routes in the same process
export const eventBus = new EventBus();
