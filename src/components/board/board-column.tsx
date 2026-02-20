'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '@/lib/types';
import { TaskCard } from './task-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BoardColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: () => void;
}

export function BoardColumn({ id, title, tasks, onTaskClick, onAddTask }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div className="flex-shrink-0 w-80 bg-muted/30 border-r border-border">
      {/* Column Header */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddTask}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add task
        </Button>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 min-h-[200px] transition-colors ${
          isOver ? 'bg-accent/50' : ''
        }`}
      >
        <SortableContext 
          items={tasks.map(task => task.id)} 
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </SortableContext>
        
        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <div className="mb-2">No tasks</div>
            <Button
              variant="outline"
              size="sm"
              onClick={onAddTask}
              className="text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add first task
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}