// Core type definitions for the agent board

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assignee?: string; // agent id
  project_id?: string;
  story_points?: number;
  due_date?: string; // ISO date
  pr_url?: string; // kept for backward compatibility
  pr_status?: PRStatus;
  branch?: string; // git branch name (primary association)
  worktree_path?: string; // if this branch has an active worktree, its path
  parent_task_id?: string;
  labels?: string[];
  sort_order: number;
  created_at: string; // ISO date
  updated_at: string; // ISO date
}

export type TaskStatus = 
  | 'backlog' 
  | 'refinement' 
  | 'pending_approval' 
  | 'todo' 
  | 'in_progress' 
  | 'review' 
  | 'done';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type PRStatus = 'open' | 'merged' | 'closed' | 'ci_passing' | 'ci_failing';

export interface Comment {
  id: string;
  task_id: string;
  author: string; // 'user' or agent id
  content: string;
  created_at: string; // ISO date
}

export interface Agent {
  id: string;
  name: string;
  model?: string;
  role?: string; // e.g. 'heavy', 'light', 'research', 'code'
  parent_agent_id?: string;
  capabilities?: string[];
  status: AgentStatus;
  current_task_id?: string;
}

export type AgentStatus = 'idle' | 'busy' | 'offline';

export interface ActivityEntry {
  id: string;
  task_id?: string;
  agent_id?: string;
  action: string;
  details?: Record<string, unknown>;
  created_at: string; // ISO date
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  repo_url?: string;
  repo_owner?: string;
  repo_name?: string;
  provider?: string;
  is_private?: boolean;
  local_path?: string; // local path where repo is cloned
  created_at: string; // ISO date
  updated_at: string; // ISO date
}

export interface BoardState {
  column_order?: TaskStatus[];
  filters?: {
    assignee?: string;
    priority?: Priority;
    labels?: string[];
    project?: string;
  };
  view_preferences?: Record<string, unknown>;
}

export interface TaskIndex {
  tasks: Array<{
    id: string;
    status: TaskStatus;
    assignee?: string;
    project_id?: string;
    priority: Priority;
    updated_at: string;
    title: string;
  }>;
  last_updated: string;
}

// Valid state transitions
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['refinement'],
  refinement: ['pending_approval', 'backlog'],
  pending_approval: ['todo', 'refinement'],
  todo: ['in_progress', 'backlog'],
  in_progress: ['review', 'backlog'],
  review: ['done', 'refinement', 'backlog'],
  done: ['backlog'], // can reopen
};

export const TASK_STATUSES: TaskStatus[] = [
  'backlog',
  'refinement', 
  'pending_approval',
  'todo',
  'in_progress',
  'review',
  'done'
];

export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

// Default OpenClaw agents
export const DEFAULT_AGENTS: Omit<Agent, 'status' | 'current_task_id'>[] = [
  {
    id: 'worker-opus',
    name: 'Worker Opus',
    model: 'anthropic/claude-opus-4-6',
    role: 'heavy',
    capabilities: ['coding', 'research', 'writing', 'analysis']
  },
  {
    id: 'worker-heavy',
    name: 'Worker Heavy',
    model: 'anthropic/claude-sonnet-4-20250514',
    role: 'heavy',
    capabilities: ['coding', 'research', 'analysis']
  },
  {
    id: 'worker-light',
    name: 'Worker Light',
    model: 'anthropic/claude-sonnet-3.5',
    role: 'light',
    capabilities: ['quick-tasks', 'formatting', 'basic-queries']
  },
  {
    id: 'worker-research',
    name: 'Worker Research',
    model: 'anthropic/claude-sonnet-4-20250514',
    role: 'research',
    capabilities: ['web-search', 'analysis', 'reporting']
  },
  {
    id: 'worker-desktop',
    name: 'Worker Desktop',
    model: 'anthropic/claude-sonnet-4-20250514',
    role: 'desktop',
    capabilities: ['ui-automation', 'file-management', 'system-tasks']
  },
  {
    id: 'worker-code',
    name: 'Worker Code',
    model: 'anthropic/claude-sonnet-4-20250514',
    role: 'code',
    capabilities: ['coding', 'debugging', 'testing', 'deployment']
  }
];