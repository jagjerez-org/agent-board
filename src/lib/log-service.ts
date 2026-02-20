// Log service for managing process output and streaming

export interface LogEntry {
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system' | 'error';
  message: string;
  exitCode?: number;
}

export interface ProcessInfo {
  id: string;
  project: string;
  branch: string;
  command: string;
  pid: number;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  exitCode?: number;
}

class LogServiceClient {
  private eventSources: Map<string, EventSource> = new Map();
  private logBuffers: Map<string, LogEntry[]> = new Map();

  // Create a unique key for process identification
  private getProcessKey(project: string, branch: string, commandId?: string): string {
    return commandId ? `${project}:${branch}:${commandId}` : `${project}:${branch}:preview`;
  }

  // Subscribe to logs for a specific process
  subscribeLogs(
    project: string,
    branch: string,
    commandId: string | undefined,
    onLog: (entry: LogEntry) => void,
    onError?: (error: Event) => void
  ): () => void {
    const key = this.getProcessKey(project, branch, commandId);
    
    // Close existing connection if any
    this.unsubscribeLogs(project, branch, commandId);

    // Create new EventSource
    const params = new URLSearchParams({ project, branch });
    if (commandId) params.set('commandId', commandId);
    
    const eventSource = new EventSource(`/api/git/worktrees/logs?${params}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const logEntry: LogEntry = {
          timestamp: data.timestamp,
          type: data.type,
          message: data.message,
          exitCode: data.exitCode
        };
        
        // Store in buffer
        const buffer = this.logBuffers.get(key) || [];
        buffer.push(logEntry);
        
        // Keep only last 1000 entries
        if (buffer.length > 1000) {
          buffer.shift();
        }
        
        this.logBuffers.set(key, buffer);
        
        // Notify subscriber
        onLog(logEntry);
      } catch (error) {
        console.error('Error parsing log entry:', error);
        onError?.(new Event('parse-error'));
      }
    };
    
    eventSource.onerror = (event) => {
      console.error('EventSource error:', event);
      onError?.(event);
    };
    
    this.eventSources.set(key, eventSource);
    
    // Return unsubscribe function
    return () => this.unsubscribeLogs(project, branch, commandId);
  }

  // Unsubscribe from logs
  unsubscribeLogs(project: string, branch: string, commandId?: string) {
    const key = this.getProcessKey(project, branch, commandId);
    const eventSource = this.eventSources.get(key);
    
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(key);
    }
  }

  // Get cached log buffer
  getLogBuffer(project: string, branch: string, commandId?: string): LogEntry[] {
    const key = this.getProcessKey(project, branch, commandId);
    return this.logBuffers.get(key) || [];
  }

  // Clear log buffer
  clearLogBuffer(project: string, branch: string, commandId?: string) {
    const key = this.getProcessKey(project, branch, commandId);
    this.logBuffers.set(key, []);
  }

  // Start a new command and return its ID
  async startCommand(project: string, branch: string, command: string): Promise<string> {
    const response = await fetch('/api/git/worktrees/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, branch, command })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to start command');
    }
    
    const data = await response.json();
    return data.commandId;
  }

  // Clean up all connections
  cleanup() {
    this.eventSources.forEach(eventSource => eventSource.close());
    this.eventSources.clear();
    this.logBuffers.clear();
  }
}

// Export a singleton instance
export const logService = new LogServiceClient();

// Clean up on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logService.cleanup();
  });
}

// Utility functions for log formatting
export function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const prefix = entry.type === 'stdout' ? '[OUT]' : 
                entry.type === 'stderr' ? '[ERR]' : 
                entry.type === 'system' ? '[SYS]' : '[ERR]';
  
  return `${time} ${prefix} ${entry.message}`;
}

export function getLogTypeColor(type: LogEntry['type']): string {
  switch (type) {
    case 'stdout':
      return 'text-green-400';
    case 'stderr':
      return 'text-red-400';
    case 'system':
      return 'text-blue-400';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-300';
  }
}

// ANSI color code removal utility
export function stripAnsiCodes(text: string): string {
  // Remove ANSI escape sequences
  return text.replace(/\u001b\[[\d;]*m/g, '');
}