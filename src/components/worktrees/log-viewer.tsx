'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Terminal,
  Play,
  Trash2,
  Copy,
  Pause,
  RotateCcw,
  Square,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { logService, LogEntry, formatLogEntry, getLogTypeColor, stripAnsiCodes } from '@/lib/log-service';
interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

interface LogViewerProps {
  projectId: string;
  worktrees: Worktree[];
  selectedBranch?: string;
}

interface ActiveCommand {
  id: string;
  branch: string;
  command: string;
  startedAt: string;
}

export function LogViewer({ projectId, worktrees, selectedBranch }: LogViewerProps) {
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const [activeCommands, setActiveCommands] = useState<ActiveCommand[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedLogKey, setSelectedLogKey] = useState<string>('');
  const [newCommand, setNewCommand] = useState('');
  const [targetBranch, setTargetBranch] = useState(selectedBranch || '');
  const [runningCommands, setRunningCommands] = useState<Set<string>>(new Set());
  
  const logRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const unsubscribeFunctions = useRef<Map<string, () => void>>(new Map());

  // Common commands for quick access
  const commonCommands = [
    'pnpm build',
    'pnpm test',
    'pnpm lint',
    'pnpm type-check',
    'git status',
    'git log --oneline -10'
  ];

  // Create log key for identification
  const createLogKey = (branch: string, commandId?: string) => {
    return commandId ? `${branch}:${commandId}` : `${branch}:preview`;
  };

  // Subscribe to logs for a specific process
  const subscribeLogs = (branch: string, commandId?: string, label?: string) => {
    const logKey = createLogKey(branch, commandId);
    
    // Don't subscribe if already subscribed
    if (unsubscribeFunctions.current.has(logKey)) {
      return;
    }

    const unsubscribe = logService.subscribeLogs(
      projectId,
      branch,
      commandId,
      (logEntry: LogEntry) => {
        setLogs(prevLogs => {
          const updated = new Map(prevLogs);
          const entries = updated.get(logKey) || [];
          entries.push(logEntry);
          
          // Keep only last 1000 entries
          if (entries.length > 1000) {
            entries.shift();
          }
          
          updated.set(logKey, entries);
          return updated;
        });
        
        // Auto-scroll if enabled
        if (autoScroll && selectedLogKey === logKey) {
          const logRef = logRefs.current.get(logKey);
          if (logRef) {
            setTimeout(() => {
              logRef.scrollTop = logRef.scrollHeight;
            }, 50);
          }
        }
      },
      (error) => {
        console.error('Log subscription error:', error);
      }
    );
    
    unsubscribeFunctions.current.set(logKey, unsubscribe);
  };

  // Unsubscribe from logs
  const unsubscribeLogs = (branch: string, commandId?: string) => {
    const logKey = createLogKey(branch, commandId);
    const unsubscribe = unsubscribeFunctions.current.get(logKey);
    
    if (unsubscribe) {
      unsubscribe();
      unsubscribeFunctions.current.delete(logKey);
    }
  };

  // Run a command
  const runCommand = async (command: string, branch: string) => {
    if (!command.trim() || !branch) return;
    
    const runKey = `${branch}:${command}`;
    setRunningCommands(prev => new Set([...prev, runKey]));
    
    try {
      const commandId = await logService.startCommand(projectId, branch, command);
      
      // Add to active commands
      const activeCommand: ActiveCommand = {
        id: commandId,
        branch,
        command,
        startedAt: new Date().toISOString()
      };
      
      setActiveCommands(prev => [...prev, activeCommand]);
      
      // Subscribe to its logs
      subscribeLogs(branch, commandId);
      
      // Select this log view
      const logKey = createLogKey(branch, commandId);
      setSelectedLogKey(logKey);
      
      // Clear input
      setNewCommand('');
    } catch (error) {
      console.error('Error running command:', error);
      alert(error instanceof Error ? error.message : 'Failed to run command');
    } finally {
      setRunningCommands(prev => {
        const updated = new Set(prev);
        updated.delete(runKey);
        return updated;
      });
    }
  };

  // Clear logs
  const clearLogs = (branch: string, commandId?: string) => {
    const logKey = createLogKey(branch, commandId);
    setLogs(prev => {
      const updated = new Map(prev);
      updated.set(logKey, []);
      return updated;
    });
    
    logService.clearLogBuffer(projectId, branch, commandId);
  };

  // Copy logs to clipboard
  const copyLogs = (branch: string, commandId?: string) => {
    const logKey = createLogKey(branch, commandId);
    const entries = logs.get(logKey) || [];
    const text = entries.map(entry => stripAnsiCodes(formatLogEntry(entry))).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast notification here
    }).catch(err => {
      console.error('Failed to copy logs:', err);
    });
  };

  // Get display name for log key
  const getLogDisplayName = (logKey: string): string => {
    const [branch, commandId] = logKey.split(':');
    if (commandId === 'preview') {
      return `${branch} (Preview Server)`;
    }
    
    const activeCommand = activeCommands.find(cmd => cmd.id === commandId);
    if (activeCommand) {
      return `${branch}: ${activeCommand.command}`;
    }
    
    return `${branch}: ${commandId}`;
  };

  // Initialize with selected branch
  useEffect(() => {
    if (selectedBranch) {
      setTargetBranch(selectedBranch);
      const previewLogKey = createLogKey(selectedBranch);
      setSelectedLogKey(previewLogKey);
      subscribeLogs(selectedBranch);
    }
  }, [selectedBranch]);

  // Clean up subscriptions on unmount
  useEffect(() => {
    return () => {
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current.clear();
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && selectedLogKey) {
      const logRef = logRefs.current.get(selectedLogKey);
      if (logRef) {
        logRef.scrollTop = logRef.scrollHeight;
      }
    }
  }, [logs, selectedLogKey, autoScroll]);

  const availableLogs = Array.from(logs.keys());
  const currentLogs = selectedLogKey ? logs.get(selectedLogKey) || [] : [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Command Runner & Logs
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Command input */}
          <div className="flex gap-2">
            <Select value={targetBranch} onValueChange={setTargetBranch}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select branch..." />
              </SelectTrigger>
              <SelectContent>
                {worktrees.map((worktree) => (
                  <SelectItem key={worktree.branch} value={worktree.branch}>
                    {worktree.branch}
                    {worktree.isMain && <span className="text-xs text-muted-foreground ml-2">(main)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="Enter command..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  runCommand(newCommand, targetBranch);
                }
              }}
            />
            
            <Button 
              onClick={() => runCommand(newCommand, targetBranch)}
              disabled={!newCommand.trim() || !targetBranch || runningCommands.has(`${targetBranch}:${newCommand}`)}
            >
              {runningCommands.has(`${targetBranch}:${newCommand}`) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {/* Quick commands */}
          <div className="flex flex-wrap gap-2">
            {commonCommands.map((command) => (
              <Button
                key={command}
                variant="outline"
                size="sm"
                onClick={() => runCommand(command, targetBranch)}
                disabled={!targetBranch || runningCommands.has(`${targetBranch}:${command}`)}
              >
                {runningCommands.has(`${targetBranch}:${command}`) && (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                )}
                {command}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Log viewer */}
      {availableLogs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Active Logs</h3>
            <p className="text-muted-foreground">
              Run a command or start a preview server to see logs here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Log selection sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Logs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  {availableLogs.map((logKey) => (
                    <button
                      key={logKey}
                      onClick={() => setSelectedLogKey(logKey)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-none hover:bg-accent ${
                        selectedLogKey === logKey ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium truncate">
                        {getLogDisplayName(logKey)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(logs.get(logKey) || []).length} lines
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Log content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {selectedLogKey ? getLogDisplayName(selectedLogKey) : 'Select a log'}
                  </CardTitle>
                  
                  {selectedLogKey && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="auto-scroll"
                          checked={autoScroll}
                          onCheckedChange={setAutoScroll}
                        />
                        <Label htmlFor="auto-scroll" className="text-xs">Auto-scroll</Label>
                      </div>
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          const [branch, commandId] = selectedLogKey.split(':');
                          copyLogs(branch, commandId === 'preview' ? undefined : commandId);
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          const [branch, commandId] = selectedLogKey.split(':');
                          clearLogs(branch, commandId === 'preview' ? undefined : commandId);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                {selectedLogKey ? (
                  <div
                    ref={(el) => {
                      if (el) logRefs.current.set(selectedLogKey, el);
                    }}
                    className="h-96 overflow-auto bg-black text-white p-4 font-mono text-sm"
                    style={{ backgroundColor: '#0a0a0a' }}
                  >
                    {currentLogs.length === 0 ? (
                      <div className="text-gray-500 italic">No logs yet...</div>
                    ) : (
                      currentLogs.map((entry, index) => (
                        <div key={index} className="flex">
                          <span className="text-gray-500 mr-2 flex-shrink-0">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`mr-2 flex-shrink-0 font-bold ${
                            entry.type === 'stdout' ? 'text-green-400' :
                            entry.type === 'stderr' ? 'text-red-400' :
                            entry.type === 'system' ? 'text-blue-400' :
                            'text-red-500'
                          }`}>
                            {entry.type === 'stdout' ? '[OUT]' :
                             entry.type === 'stderr' ? '[ERR]' :
                             entry.type === 'system' ? '[SYS]' : '[ERR]'}
                          </span>
                          <span className={getLogTypeColor(entry.type)}>
                            {stripAnsiCodes(entry.message)}
                          </span>
                          {entry.exitCode !== undefined && (
                            <Badge 
                              variant={entry.exitCode === 0 ? "default" : "destructive"} 
                              className="ml-2 text-xs"
                            >
                              Exit {entry.exitCode}
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center text-muted-foreground">
                    Select a log stream to view output
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}