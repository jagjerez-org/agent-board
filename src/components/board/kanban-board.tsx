'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Task, TaskStatus, TASK_STATUSES } from '@/lib/types';
import { BoardColumn } from './board-column';
import { TaskCard } from './task-card';
import { TaskFilters } from './task-filters';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface TasksByStatus {
  [key: string]: Task[];
}

const COLUMN_TITLES: Record<TaskStatus, string> = {
  backlog: '📋 Backlog',
  refinement: '🔍 Refinement',
  pending_approval: '⏳ Pending Approval',
  todo: '🔜 To Do',
  in_progress: '🏃 In Progress',
  review: '👀 Review',
  done: '✅ Done'
};

export function KanbanBoard() {
  const [tasksByStatus, setTasksByStatus] = useState<TasksByStatus>({});
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Load tasks grouped by status
  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/tasks?groupBy=status');
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const data = await response.json();
      setTasksByStatus(data);
    } catch (error) {
      console.error('Error loading tasks:', error);
      setError('Failed to load tasks. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = findTaskById(active.id as string);
    setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropping over a column
    if (TASK_STATUSES.includes(overId as TaskStatus)) {
      const newStatus = overId as TaskStatus;
      const task = findTaskById(taskId);
      
      if (task && task.status !== newStatus) {
        try {
          // Optimistically update UI
          const updatedTasks = { ...tasksByStatus };
          
          // Remove task from old column
          updatedTasks[task.status] = updatedTasks[task.status].filter(t => t.id !== taskId);
          
          // Add task to new column
          const updatedTask = { ...task, status: newStatus };
          updatedTasks[newStatus] = [...(updatedTasks[newStatus] || []), updatedTask];
          
          setTasksByStatus(updatedTasks);
          
          // Make API call
          const response = await fetch(`/api/tasks/${taskId}/move`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
          });

          if (!response.ok) {
            // Revert on error
            setTasksByStatus(tasksByStatus);
            const error = await response.json();
            alert(error.error || 'Failed to move task');
          }
        } catch (error) {
          // Revert on error
          setTasksByStatus(tasksByStatus);
          console.error('Error moving task:', error);
          alert('Failed to move task');
        }
      }
    }

    // Handle reordering within the same column
    else {
      const task = findTaskById(taskId);
      const overTask = findTaskById(overId);
      
      if (task && overTask && task.status === overTask.status) {
        const status = task.status;
        const column = [...tasksByStatus[status]];
        const oldIndex = column.findIndex(t => t.id === taskId);
        const newIndex = column.findIndex(t => t.id === overId);
        
        if (oldIndex !== newIndex) {
          const reorderedTasks = arrayMove(column, oldIndex, newIndex);
          
          setTasksByStatus({
            ...tasksByStatus,
            [status]: reorderedTasks
          });
          
          // TODO: Update sort_order in backend if needed
        }
      }
    }
  };

  const findTaskById = (id: string): Task | null => {
    for (const status of TASK_STATUSES) {
      const task = tasksByStatus[status]?.find(task => task.id === id);
      if (task) return task;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive text-lg mb-4">{error}</p>
          <button
            onClick={loadTasks}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="border-b border-border bg-card px-6 py-3">
        <TaskFilters onFilterChange={(filters) => {
          // TODO: Apply filters to tasks
          console.log('Filters changed:', filters);
        }} />
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full overflow-x-auto">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                id={status}
                title={COLUMN_TITLES[status]}
                tasks={tasksByStatus[status] || []}
                onTaskClick={(task) => {
                  // TODO: Open task detail modal
                  console.log('Task clicked:', task);
                }}
                onAddTask={() => {
                  // TODO: Open create task modal for this status
                  console.log('Add task to:', status);
                }}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} overlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}