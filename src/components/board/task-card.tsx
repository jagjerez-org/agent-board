'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Priority } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageSquare, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  overlay?: boolean;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400',
  high: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  medium: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  low: 'border-gray-500 bg-gray-500/10 text-gray-700 dark:text-gray-400'
};

const PRIORITY_ICONS = {
  critical: '🔥',
  high: '⚡',
  medium: '➡️',
  low: '⬇️'
};

export function TaskCard({ task, onClick, overlay = false }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: overlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Check if task is overdue
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  
  // Parse agent name from ID for display
  const getAgentDisplayName = (agentId?: string) => {
    if (!agentId) return null;
    return agentId.replace('worker-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getPRStatusColor = (status?: string) => {
    switch (status) {
      case 'ci_passing': return 'text-green-600';
      case 'ci_failing': return 'text-red-600';
      case 'merged': return 'text-purple-600';
      case 'closed': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  };

  const getPRStatusIcon = (status?: string) => {
    switch (status) {
      case 'ci_passing': return '✅';
      case 'ci_failing': return '❌';
      case 'merged': return '🔀';
      case 'closed': return '🚫';
      default: return '🔗';
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'p-3 cursor-pointer hover:shadow-md transition-shadow bg-card border border-border',
        isDragging && 'opacity-50',
        overlay && 'shadow-lg rotate-3',
        isOverdue && 'border-red-500/50'
      )}
      onClick={onClick}
    >
      {/* Title */}
      <div className="mb-3">
        <h4 className="font-medium text-sm leading-tight line-clamp-2">
          {task.title}
        </h4>
      </div>

      {/* Priority badge */}
      <div className="flex items-center gap-2 mb-2">
        <Badge
          variant="outline"
          className={cn('text-xs px-1.5 py-0.5', PRIORITY_COLORS[task.priority])}
        >
          {PRIORITY_ICONS[task.priority]} {task.priority}
        </Badge>
        
        {task.story_points && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
            {task.story_points}pt
          </Badge>
        )}
      </div>

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 3).map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="text-xs px-1.5 py-0.5 bg-secondary/50"
            >
              {label}
            </Badge>
          ))}
          {task.labels.length > 3 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
              +{task.labels.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <div className={cn(
          'flex items-center text-xs mb-2',
          isOverdue ? 'text-red-600' : 'text-muted-foreground'
        )}>
          <Clock className="w-3 h-3 mr-1" />
          {new Date(task.due_date).toLocaleDateString()}
          {isOverdue && <AlertTriangle className="w-3 h-3 ml-1" />}
        </div>
      )}

      {/* PR link */}
      {task.pr_url && (
        <div className="flex items-center text-xs mb-2">
          <span className={cn('mr-1', getPRStatusColor(task.pr_status))}>
            {getPRStatusIcon(task.pr_status)}
          </span>
          <ExternalLink className="w-3 h-3 mr-1 text-muted-foreground" />
          <span className="text-muted-foreground truncate">
            #{task.pr_url.split('/').pop()}
          </span>
        </div>
      )}

      {/* Bottom row: Assignee and comment count */}
      <div className="flex items-center justify-between mt-3">
        {/* Assignee */}
        <div className="flex items-center">
          {task.assignee ? (
            <div className="flex items-center">
              <Avatar className="h-5 w-5 mr-1">
                <AvatarFallback className="text-xs bg-primary/10">
                  {getAgentDisplayName(task.assignee)?.charAt(0) || 'A'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-20">
                {getAgentDisplayName(task.assignee)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>

        {/* Comment count (placeholder) */}
        <div className="flex items-center text-xs text-muted-foreground">
          <MessageSquare className="w-3 h-3 mr-1" />
          <span>0</span>
        </div>
      </div>
    </Card>
  );
}