// Higher-level task operations using file-based storage
import { v4 as uuidv4 } from 'uuid';
import { Task, Comment, TaskStatus, Priority, PRStatus, VALID_TRANSITIONS } from './types';
import * as storage from './storage';
import { logActivity } from './activity-store';

export interface CreateTaskData {
  title: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  project_id?: string;
  story_points?: number;
  due_date?: string;
  labels?: string[];
  parent_task_id?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  project_id?: string;
  story_points?: number;
  due_date?: string;
  labels?: string[];
  pr_url?: string;
  pr_status?: PRStatus;
  sort_order?: number;
}

// Create a new task
export async function createTask(data: CreateTaskData): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: uuidv4(),
    title: data.title,
    description: data.description,
    status: 'backlog',
    priority: data.priority || 'medium',
    assignee: data.assignee,
    project_id: data.project_id,
    story_points: data.story_points,
    due_date: data.due_date,
    labels: data.labels || [],
    parent_task_id: data.parent_task_id,
    sort_order: 0,
    created_at: now,
    updated_at: now
  };

  await storage.writeTask(task);
  await storage.rebuildIndex(); // Update index
  
  await logActivity({
    task_id: task.id,
    action: 'created',
    details: { title: task.title, priority: task.priority }
  });

  return task;
}

// Get task by ID
export async function getTask(id: string): Promise<{ task: Task; comments: Comment[] } | null> {
  return storage.readTask(id);
}

// Update task
export async function updateTask(id: string, data: UpdateTaskData): Promise<Task | null> {
  const result = await storage.readTask(id);
  if (!result) return null;

  const { task, comments } = result;
  const now = new Date().toISOString();
  
  const updatedTask: Task = {
    ...task,
    ...data,
    id, // Ensure ID doesn't change
    updated_at: now
  };

  await storage.writeTask(updatedTask, comments);
  await storage.rebuildIndex(); // Update index
  
  // Log changes
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  Object.keys(data).forEach(key => {
    const dataKey = key as keyof UpdateTaskData;
    const taskKey = key as keyof Task;
    if (data[dataKey] !== (task as unknown as Record<string, unknown>)[taskKey]) {
      changes[key] = { from: (task as unknown as Record<string, unknown>)[taskKey], to: data[dataKey] };
    }
  });
  
  if (Object.keys(changes).length > 0) {
    await logActivity({
      task_id: id,
      action: 'updated',
      details: { changes }
    });
  }

  return updatedTask;
}

// Move task to new status
export async function moveTask(id: string, newStatus: TaskStatus, newSortOrder?: number): Promise<Task | null> {
  const result = await storage.readTask(id);
  if (!result) return null;

  const { task, comments } = result;
  
  // Validate transition
  if (!VALID_TRANSITIONS[task.status].includes(newStatus)) {
    throw new Error(`Invalid transition from ${task.status} to ${newStatus}`);
  }

  const now = new Date().toISOString();
  const updatedTask: Task = {
    ...task,
    status: newStatus,
    sort_order: newSortOrder ?? task.sort_order,
    updated_at: now
  };

  await storage.writeTask(updatedTask, comments);
  await storage.rebuildIndex(); // Update index
  
  await logActivity({
    task_id: id,
    action: 'status_changed',
    details: { from: task.status, to: newStatus }
  });

  return updatedTask;
}

// Assign task to agent
export async function assignTask(id: string, agentId: string): Promise<Task | null> {
  const result = await storage.readTask(id);
  if (!result) return null;

  const { task, comments } = result;
  const now = new Date().toISOString();
  
  const updatedTask: Task = {
    ...task,
    assignee: agentId,
    updated_at: now
  };

  await storage.writeTask(updatedTask, comments);
  await storage.rebuildIndex(); // Update index
  
  await logActivity({
    task_id: id,
    agent_id: agentId,
    action: 'assigned',
    details: { previous_assignee: task.assignee }
  });

  return updatedTask;
}

// Add comment to task
export async function addComment(taskId: string, author: string, content: string): Promise<Comment> {
  const result = await storage.readTask(taskId);
  if (!result) throw new Error('Task not found');

  const { task, comments } = result;
  const now = new Date().toISOString();
  
  const comment: Comment = {
    id: uuidv4(),
    task_id: taskId,
    author,
    content,
    created_at: now
  };

  const updatedComments = [...comments, comment];
  await storage.writeTask(task, updatedComments);
  
  await logActivity({
    task_id: taskId,
    agent_id: author !== 'user' ? author : undefined,
    action: 'commented',
    details: { comment_length: content.length }
  });

  return comment;
}

// Link PR to task
export async function linkPR(id: string, prUrl: string): Promise<Task | null> {
  const result = await storage.readTask(id);
  if (!result) return null;

  const { task, comments } = result;
  const now = new Date().toISOString();
  
  const updatedTask: Task = {
    ...task,
    pr_url: prUrl,
    pr_status: 'open' as PRStatus, // Default status
    updated_at: now
  };

  await storage.writeTask(updatedTask, comments);
  await storage.rebuildIndex(); // Update index
  
  await logActivity({
    task_id: id,
    action: 'pr_linked',
    details: { pr_url: prUrl }
  });

  return updatedTask;
}

// Delete task
export async function deleteTask(id: string): Promise<boolean> {
  const result = await storage.readTask(id);
  if (!result) return false;

  const success = await storage.deleteTask(id);
  if (success) {
    await storage.rebuildIndex(); // Update index
    await logActivity({
      task_id: id,
      action: 'deleted',
      details: { title: result.task.title }
    });
  }
  
  return success;
}

// List tasks with filters
export async function listTasks(filters?: {
  status?: TaskStatus;
  assignee?: string;
  priority?: Priority;
  project?: string;
  labels?: string[];
}): Promise<Task[]> {
  const index = await storage.readIndex();
  let filteredTasks = index.tasks;

  // Apply filters at index level for better performance
  if (filters?.status) {
    filteredTasks = filteredTasks.filter(t => t.status === filters.status);
  }
  if (filters?.assignee) {
    filteredTasks = filteredTasks.filter(t => t.assignee === filters.assignee);
  }
  if (filters?.priority) {
    filteredTasks = filteredTasks.filter(t => t.priority === filters.priority);
  }
  if (filters?.project) {
    filteredTasks = filteredTasks.filter(t => t.project_id === filters.project);
  }

  // For label filtering, we need to load full tasks (project is now filtered at index level)
  if (filters?.labels && filters.labels.length > 0) {
    const fullTasks: Task[] = [];
    for (const taskSummary of filteredTasks) {
      const result = await storage.readTask(taskSummary.id);
      if (result) {
        // Apply labels filter
        const hasAllLabels = filters.labels!.every(label => 
          result.task.labels?.includes(label)
        );
        if (hasAllLabels) {
          fullTasks.push(result.task);
        }
      }
    }
    return fullTasks.sort((a, b) => a.sort_order - b.sort_order);
  }

  // Load full task data
  const tasks: Task[] = [];
  for (const taskSummary of filteredTasks) {
    const result = await storage.readTask(taskSummary.id);
    if (result) {
      tasks.push(result.task);
    }
  }

  return tasks.sort((a, b) => a.sort_order - b.sort_order);
}

// Get tasks by status (for kanban board)
export async function getTasksByStatus(projectFilter?: string): Promise<Record<TaskStatus, Task[]>> {
  const allTasks = await listTasks(projectFilter ? { project: projectFilter } : undefined);
  
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    backlog: [],
    refinement: [],
    pending_approval: [],
    todo: [],
    in_progress: [],
    review: [],
    done: []
  };

  allTasks.forEach(task => {
    tasksByStatus[task.status].push(task);
  });

  // Sort each status by sort_order
  Object.keys(tasksByStatus).forEach(status => {
    tasksByStatus[status as TaskStatus].sort((a, b) => a.sort_order - b.sort_order);
  });

  return tasksByStatus;
}

// Get task statistics
export async function getTaskStats(): Promise<{
  total: number;
  by_status: Record<TaskStatus, number>;
  by_priority: Record<Priority, number>;
  by_assignee: Record<string, number>;
}> {
  const index = await storage.readIndex();
  const tasks = index.tasks;

  const stats = {
    total: tasks.length,
    by_status: {} as Record<TaskStatus, number>,
    by_priority: {} as Record<Priority, number>,
    by_assignee: {} as Record<string, number>
  };

  // Initialize counters
  (['backlog', 'refinement', 'pending_approval', 'todo', 'in_progress', 'review', 'done'] as TaskStatus[]).forEach(status => {
    stats.by_status[status] = 0;
  });
  
  (['critical', 'high', 'medium', 'low'] as Priority[]).forEach(priority => {
    stats.by_priority[priority] = 0;
  });

  // Count tasks
  tasks.forEach(task => {
    stats.by_status[task.status]++;
    stats.by_priority[task.priority]++;
    
    if (task.assignee) {
      stats.by_assignee[task.assignee] = (stats.by_assignee[task.assignee] || 0) + 1;
    } else {
      stats.by_assignee['unassigned'] = (stats.by_assignee['unassigned'] || 0) + 1;
    }
  });

  return stats;
}