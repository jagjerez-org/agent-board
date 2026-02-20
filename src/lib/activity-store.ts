// Activity logging using file-based storage
import { v4 as uuidv4 } from 'uuid';
import { ActivityEntry } from './types';
import * as storage from './storage';

export interface LogActivityData {
  task_id?: string;
  agent_id?: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface ActivityFilters {
  taskId?: string;
  agentId?: string;
  action?: string;
  limit?: number;
  offset?: number;
  startDate?: string; // ISO date
  endDate?: string; // ISO date
}

// Log a new activity entry
export async function logActivity(data: LogActivityData): Promise<ActivityEntry> {
  const activity: ActivityEntry = {
    id: uuidv4(),
    task_id: data.task_id,
    agent_id: data.agent_id,
    action: data.action,
    details: data.details,
    created_at: new Date().toISOString()
  };

  await storage.appendActivity(activity);
  return activity;
}

// Get activity entries with filters
export async function getActivity(filters?: ActivityFilters): Promise<ActivityEntry[]> {
  let activities = await storage.readActivity({
    taskId: filters?.taskId,
    agentId: filters?.agentId,
    limit: filters?.limit,
    offset: filters?.offset
  });

  // Additional filtering
  if (filters?.action) {
    activities = activities.filter(a => a.action === filters.action);
  }

  if (filters?.startDate) {
    const startDate = new Date(filters.startDate);
    activities = activities.filter(a => new Date(a.created_at) >= startDate);
  }

  if (filters?.endDate) {
    const endDate = new Date(filters.endDate);
    activities = activities.filter(a => new Date(a.created_at) <= endDate);
  }

  return activities;
}

// Get activity for a specific task
export async function getTaskActivity(taskId: string, limit?: number): Promise<ActivityEntry[]> {
  return getActivity({ taskId, limit });
}

// Get activity for a specific agent
export async function getAgentActivity(agentId: string, limit?: number): Promise<ActivityEntry[]> {
  return getActivity({ agentId, limit });
}

// Get recent global activity
export async function getRecentActivity(limit = 50): Promise<ActivityEntry[]> {
  return getActivity({ limit });
}

// Get activity statistics
export async function getActivityStats(timeWindow?: {
  startDate: string;
  endDate: string;
}): Promise<{
  total: number;
  by_action: Record<string, number>;
  by_agent: Record<string, number>;
  by_day: Record<string, number>; // YYYY-MM-DD -> count
}> {
  const filters: ActivityFilters = { limit: 10000 }; // Get a large sample
  
  if (timeWindow) {
    filters.startDate = timeWindow.startDate;
    filters.endDate = timeWindow.endDate;
  }
  
  const activities = await getActivity(filters);
  
  const stats = {
    total: activities.length,
    by_action: {} as Record<string, number>,
    by_agent: {} as Record<string, number>,
    by_day: {} as Record<string, number>
  };

  activities.forEach(activity => {
    // Count by action
    stats.by_action[activity.action] = (stats.by_action[activity.action] || 0) + 1;
    
    // Count by agent
    if (activity.agent_id) {
      stats.by_agent[activity.agent_id] = (stats.by_agent[activity.agent_id] || 0) + 1;
    }
    
    // Count by day
    const day = activity.created_at.split('T')[0]; // Extract YYYY-MM-DD
    stats.by_day[day] = (stats.by_day[day] || 0) + 1;
  });

  return stats;
}

// Get activity timeline for display
export async function getActivityTimeline(limit = 100): Promise<Array<{
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: 'task' | 'agent' | 'system';
  task_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}>> {
  const activities = await getActivity({ limit });
  
  return activities.map(activity => {
    let title = '';
    let description = '';
    let type: 'task' | 'agent' | 'system' = 'system';

    // Format activity for display
    switch (activity.action) {
      case 'created':
        title = `Task created: ${(activity.details?.title as string) || 'Untitled'}`;
        description = `New ${(activity.details?.priority as string) || 'medium'} priority task`;
        type = 'task';
        break;
        
      case 'updated':
        title = 'Task updated';
        description = Object.keys(activity.details?.changes || {}).join(', ');
        type = 'task';
        break;
        
      case 'status_changed':
        title = 'Status changed';
        description = `${(activity.details?.from as string)} → ${(activity.details?.to as string)}`;
        type = 'task';
        break;
        
      case 'assigned':
        title = 'Task assigned';
        description = `Assigned to agent`;
        type = 'task';
        break;
        
      case 'commented':
        title = 'Comment added';
        description = `${(activity.details?.comment_length as number) || 0} characters`;
        type = 'task';
        break;
        
      case 'pr_linked':
        title = 'PR linked';
        description = (activity.details?.pr_url as string) || 'Pull request linked';
        type = 'task';
        break;
        
      case 'deleted':
        title = 'Task deleted';
        description = (activity.details?.title as string) || 'Task removed';
        type = 'task';
        break;
        
      case 'agent_created':
        title = `Agent created: ${(activity.details?.name as string) || 'Unnamed'}`;
        description = `Role: ${(activity.details?.role as string) || 'unspecified'}`;
        type = 'agent';
        break;
        
      case 'agent_updated':
        title = 'Agent updated';
        description = Object.keys(activity.details?.changes || {}).join(', ');
        type = 'agent';
        break;
        
      case 'assigned_to_task':
        title = 'Agent assigned to task';
        description = 'Marked as busy';
        type = 'agent';
        break;
        
      case 'freed_from_task':
        title = 'Agent freed from task';
        description = 'Marked as idle';
        type = 'agent';
        break;
        
      default:
        title = activity.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        description = JSON.stringify(activity.details) || '';
        break;
    }

    return {
      id: activity.id,
      timestamp: activity.created_at,
      title,
      description,
      type,
      task_id: activity.task_id,
      agent_id: activity.agent_id,
      metadata: activity.details
    };
  });
}

// Get activity summary for a time period
export async function getActivitySummary(days = 7): Promise<{
  period: string;
  task_activities: number;
  agent_activities: number;
  most_active_agents: Array<{ id: string; count: number }>;
  common_actions: Array<{ action: string; count: number }>;
}> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  const stats = await getActivityStats({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });

  // Count task vs agent activities
  let taskActivities = 0;
  let agentActivities = 0;
  
  Object.entries(stats.by_action).forEach(([action, count]) => {
    if (action.includes('agent') || action === 'assigned_to_task' || action === 'freed_from_task') {
      agentActivities += count;
    } else {
      taskActivities += count;
    }
  });

  // Most active agents
  const mostActiveAgents = Object.entries(stats.by_agent)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Common actions
  const commonActions = Object.entries(stats.by_action)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    period: `${days} days`,
    task_activities: taskActivities,
    agent_activities: agentActivities,
    most_active_agents: mostActiveAgents,
    common_actions: commonActions
  };
}