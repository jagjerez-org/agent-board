'use client';

import { useEffect, useRef, useCallback } from 'react';

export type BoardEventType = 
  | 'task:created' | 'task:updated' | 'task:moved' 
  | 'task:deleted' | 'task:commented' | 'task:assigned' 
  | 'agent:updated' | 'board:refresh' | 'connected';

export interface BoardEvent {
  type: BoardEventType;
  payload?: unknown;
  timestamp: string;
}

/**
 * Hook that connects to the SSE stream and calls onEvent for each board event.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useBoardEvents(onEvent: (event: BoardEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reconnectDelay = useRef(1000);

  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;

    function connect() {
      if (!mounted) return;

      es = new EventSource('/api/events');

      es.onmessage = (msg) => {
        try {
          const event: BoardEvent = JSON.parse(msg.data);
          onEventRef.current(event);
        } catch { /* ignore malformed */ }
      };

      es.onopen = () => {
        reconnectDelay.current = 1000; // Reset on successful connect
      };

      es.onerror = () => {
        es?.close();
        if (!mounted) return;
        // Reconnect with backoff (max 30s)
        setTimeout(connect, reconnectDelay.current);
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
      };
    }

    connect();

    return () => {
      mounted = false;
      es?.close();
    };
  }, []);
}
