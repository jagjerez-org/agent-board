'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Task, TaskStatus, TASK_STATUSES } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useBoardEvents, BoardEvent } from '@/hooks/use-board-events';
import { TaskSheet } from './task-sheet';
import { Button } from '@/components/ui/button';
import { Plus, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';

interface TasksByStatus {
  [key: string]: Task[];
}

const COLUMN_CONFIG: Record<TaskStatus, { icon: string; label: string }> = {
  backlog: { icon: '📋', label: 'Backlog' },
  refinement: { icon: '🔍', label: 'Refinement' },
  pending_approval: { icon: '⏳', label: 'Pending Approval' },
  todo: { icon: '🔜', label: 'To Do' },
  in_progress: { icon: '🏃', label: 'In Progress' },
  review: { icon: '👀', label: 'Review' },
  done: { icon: '✅', label: 'Done' },
  production: { icon: '🚀', label: 'Production' },
};

// Default visible columns (excludes pending_approval and production)
const DEFAULT_VISIBLE_COLUMNS: TaskStatus[] = [
  'backlog',
  'refinement', 
  'todo',
  'in_progress',
  'review',
  'done'
];

interface KanbanBoardProps {
  projectId?: string;
  onCreateRef?: React.MutableRefObject<(() => void) | null>;
}

export function KanbanBoard({ projectId, onCreateRef }: KanbanBoardProps = {}) {
  const [tasksByStatus, setTasksByStatus] = useState<TasksByStatus>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Drag state
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('backlog');

  // Execution state — track which tasks are being worked on by agents
  const [executingTasks, setExecutingTasks] = useState<Set<string>>(new Set());
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<TaskStatus[]>(DEFAULT_VISIBLE_COLUMNS);

  const dragCounters = useRef<Record<string, number>>({});

  const loadTasks = useCallback(() => {
    const params = new URLSearchParams({ groupBy: 'status' });
    if (projectId) params.set('project', projectId);
    
    fetch(`/api/tasks?${params}`)
      .then(r => r.json())
      .then(data => { setTasksByStatus(data); setLoading(false); })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, [projectId]);

  // Column visibility persistence
  const getStorageKey = (projectId?: string) => 
    `board-visible-columns${projectId ? `-${projectId}` : ''}`;

  const loadVisibleColumns = useCallback((): TaskStatus[] => {
    try {
      const stored = localStorage.getItem(getStorageKey(projectId));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(col => TASK_STATUSES.includes(col));
        }
      }
    } catch (error) {
      console.warn('Failed to load column visibility preferences:', error);
    }
    return DEFAULT_VISIBLE_COLUMNS;
  }, [projectId]);

  const saveVisibleColumns = useCallback((columns: TaskStatus[]) => {
    try {
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(columns));
    } catch (error) {
      console.warn('Failed to save column visibility preferences:', error);
    }
  }, [projectId]);

  const toggleColumnVisibility = useCallback((status: TaskStatus) => {
    setVisibleColumns(prev => {
      const newColumns = prev.includes(status)
        ? prev.filter(col => col !== status)
        : [...prev, status];
      
      // Sort by original TASK_STATUSES order
      const sortedColumns = TASK_STATUSES.filter(col => newColumns.includes(col));
      
      saveVisibleColumns(sortedColumns);
      return sortedColumns;
    });
  }, [saveVisibleColumns]);

  useEffect(() => { 
    loadTasks();
  }, [loadTasks]);

  // Load visible columns on mount and project change
  useEffect(() => {
    setVisibleColumns(loadVisibleColumns());
  }, [loadVisibleColumns]);

  // Poll execution status for in_progress tasks
  useEffect(() => {
    const checkExecutions = () => {
      const inProgressTasks = tasksByStatus['in_progress'] || [];
      inProgressTasks.forEach(async (task) => {
        try {
          const res = await fetch(`/api/tasks/${task.id}/execute`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'pending' || data.status === 'spawned' || data.status === 'running') {
              setExecutingTasks(prev => new Set(prev).add(task.id));
            } else if (data.status === 'done') {
              // Auto-move to review when execution completes
              setExecutingTasks(prev => { const n = new Set(prev); n.delete(task.id); return n; });
              fetch(`/api/tasks/${task.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'review' }),
              }).then(() => loadTasks()).catch(() => {});
            } else {
              setExecutingTasks(prev => { const n = new Set(prev); n.delete(task.id); return n; });
            }
          }
        } catch { /* ignore */ }
      });
    };
    checkExecutions();
    const interval = setInterval(checkExecutions, 10000);
    return () => clearInterval(interval);
  }, [tasksByStatus, loadTasks]);

  const handleEvent = useCallback((event: BoardEvent) => {
    if (event.type === 'connected') { setConnected(true); return; }
    if (event.type.startsWith('task:') || event.type === 'board:refresh') loadTasks();
  }, [loadTasks]);

  useBoardEvents(handleEvent);

  // --- Drag handlers ---
  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Make the dragged element semi-transparent
    requestAnimationFrame(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) el.style.opacity = '0.4';
    });
  };

  const onDragEnd = (e: React.DragEvent) => {
    e.preventDefault();
    // Restore opacity
    if (dragTaskId) {
      const el = document.getElementById(`task-${dragTaskId}`);
      if (el) el.style.opacity = '1';
    }
    setDragTaskId(null);
    setDragOverColumn(null);
    dragCounters.current = {};
  };

  const onDragEnterColumn = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    dragCounters.current[status] = (dragCounters.current[status] || 0) + 1;
    setDragOverColumn(status);
  };

  const onDragLeaveColumn = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    dragCounters.current[status] = (dragCounters.current[status] || 0) - 1;
    if (dragCounters.current[status] <= 0) {
      dragCounters.current[status] = 0;
      if (dragOverColumn === status) setDragOverColumn(null);
    }
  };

  const onDragOverColumn = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDropColumn = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Restore opacity
    const el = document.getElementById(`task-${taskId}`);
    if (el) el.style.opacity = '1';
    setDragTaskId(null);
    setDragOverColumn(null);
    dragCounters.current = {};

    // Find current status
    let currentStatus: TaskStatus | null = null;
    for (const [status, tasks] of Object.entries(tasksByStatus)) {
      if (tasks.find(t => t.id === taskId)) {
        currentStatus = status as TaskStatus;
        break;
      }
    }
    if (!currentStatus || currentStatus === targetStatus) return;

    // Optimistic update
    setTasksByStatus(prev => {
      const next = { ...prev };
      const task = (next[currentStatus!] || []).find(t => t.id === taskId);
      if (!task) return prev;
      next[currentStatus!] = (next[currentStatus!] || []).filter(t => t.id !== taskId);
      next[targetStatus] = [...(next[targetStatus] || []), { ...task, status: targetStatus }];
      return next;
    });

    // API call
    try {
      const res = await fetch(`/api/tasks/${taskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to move task');
        loadTasks(); // revert
      } else if (targetStatus === 'refinement') {
        // Auto-trigger refinement when task is moved to Refinement column
        fetch(`/api/tasks/${taskId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then(r => {
          if (!r.ok) console.warn('Auto-refine trigger failed:', r.status);
        }).catch(() => console.warn('Auto-refine trigger failed'));
      }
    } catch {
      alert('Failed to move task');
      loadTasks();
    }
  };

  const openCreate = useCallback((status: TaskStatus = 'backlog') => {
    setSheetMode('create');
    setSelectedTaskId(null);
    setDefaultStatus(status);
    setSheetOpen(true);
  }, []);

  // Expose openCreate to parent via ref
  useEffect(() => {
    if (onCreateRef) onCreateRef.current = () => openCreate();
    return () => { if (onCreateRef) onCreateRef.current = null; };
  }, [onCreateRef, openCreate]);

  const openEdit = (taskId: string) => {
    setSheetMode('edit');
    setSelectedTaskId(taskId);
    setSheetOpen(true);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>;
  if (error) return <div className="text-destructive text-center p-8">{error}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Connection status and controls */}
      <div className="flex items-center justify-between px-4 py-1 text-xs text-muted-foreground border-b">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
          {connected ? 'Live' : 'Connecting...'}
        </div>
        
        {/* Column visibility toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Eye className="w-3 h-3 mr-1" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TASK_STATUSES.map(status => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={visibleColumns.includes(status)}
                onCheckedChange={() => toggleColumnVisibility(status)}
              >
                <span className="mr-2">{COLUMN_CONFIG[status].icon}</span>
                {COLUMN_CONFIG[status].label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Board columns */}
      <div className="flex flex-1 overflow-x-auto p-4 gap-3 kanban-scrollbar" style={{ minWidth: 0 }}>
        {visibleColumns.map(status => {
          const col = COLUMN_CONFIG[status];
          const tasks = tasksByStatus[status] || [];
          const isOver = dragOverColumn === status && dragTaskId !== null;

          return (
            <div
              key={status}
              className={`flex-shrink-0 w-64 flex flex-col rounded-lg min-h-0 transition-colors duration-150 ${
                isOver
                  ? 'bg-primary/10 ring-2 ring-primary/40'
                  : 'bg-muted/50'
              }`}
              onDragEnter={(e) => onDragEnterColumn(e, status)}
              onDragLeave={(e) => onDragLeaveColumn(e, status)}
              onDragOver={onDragOverColumn}
              onDrop={(e) => onDropColumn(e, status)}
            >
              {/* Column header */}
              <div className="p-3 font-semibold text-sm border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{col.icon}</span>
                  <span>{col.label}</span>
                  <span className="text-muted-foreground text-xs font-normal">({tasks.length})</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => openCreate(status)}
                  title={`Add task to ${col.label}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Tasks */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    id={`task-${task.id}`}
                    draggable={!executingTasks.has(task.id)}
                    onDragStart={(e) => { if (executingTasks.has(task.id)) { e.preventDefault(); return; } onDragStart(e, task.id); }}
                    onDragEnd={onDragEnd}
                    onClick={() => openEdit(task.id)}
                    className={`bg-card border rounded-md p-3 shadow-sm hover:shadow-md transition-all select-none ${
                      executingTasks.has(task.id) ? 'cursor-not-allowed border-blue-500/50 bg-blue-500/5' : 'cursor-grab active:cursor-grabbing'
                    } ${dragTaskId === task.id ? 'ring-2 ring-primary' : ''}`}
                  >
                    <p className="text-sm font-medium">{task.title}</p>
                    {executingTasks.has(task.id) && (
                      <p className="text-xs text-blue-400 animate-pulse mt-1">🔒 Agent working...</p>
                    )}
                    {task.status === 'refinement' && task.refinement?.includes('⏳') && (
                      <p className="text-xs text-yellow-500 animate-pulse mt-1">🤖 Agent refining...</p>
                    )}
                    {task.status === 'refinement' && !task.refinement?.includes('⏳') && !task.refinement && (
                      <p className="text-xs text-muted-foreground mt-1">Awaiting refinement</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {task.priority && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          task.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                          task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>{task.priority}</span>
                      )}
                      {task.branch && (
                        <span 
                          className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-500/30 flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Show worktree info
                            alert(`Branch: ${task.branch}`);
                          }}
                          title={`Branch: ${task.branch}`}
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7.5 3.75A1.75 1.75 0 006 2a1.75 1.75 0 00-1.75 1.75v.5a1.75 1.75 0 001.75 1.75h1.5a1.75 1.75 0 001.75-1.75v-.5z"/>
                            <path d="M6 7.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 016 7.25z"/>
                            <path fillRule="evenodd" d="M8 13.25a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zm5.25-6.5A1.75 1.75 0 0112 5a1.75 1.75 0 00-1.75 1.75v.5A1.75 1.75 0 0012 9h1.5a1.75 1.75 0 001.75-1.75v-.5z"/>
                          </svg>
                          {task.branch}
                        </span>
                      )}
                      {task.labels?.map(l => (
                        <span key={l} className="text-xs bg-muted px-1.5 py-0.5 rounded">{l}</span>
                      ))}
                    </div>
                    {task.assignee && (
                      <p className="text-xs text-muted-foreground mt-1.5">→ {task.assignee}</p>
                    )}
                  </div>
                ))}

                {/* Drop zone hint when empty and dragging */}
                {tasks.length === 0 && dragTaskId && (
                  <div className="border-2 border-dashed border-muted-foreground/30 rounded-md p-4 text-center text-xs text-muted-foreground">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TaskSheet
        taskId={selectedTaskId}
        mode={sheetMode}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={loadTasks}
        defaultStatus={defaultStatus}
        defaultProjectId={projectId}
      />
    </div>
  );
}
