// File-based storage system for agent board
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { Task, Comment, Agent, ActivityEntry, BoardState, TaskIndex } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const AGENTS_DIR = path.join(DATA_DIR, 'agents');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.jsonl');
const BOARD_STATE_FILE = path.join(DATA_DIR, 'board-state.json');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

// Ensure directories exist
export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.mkdir(AGENTS_DIR, { recursive: true });
}

// Task storage
export async function writeTask(task: Task, comments: Comment[] = []): Promise<void> {
  await ensureDataDirs();
  
  const { description, refinement, ...taskData } = task as Task & { refinement?: string };
  
  // Filter out undefined values for clean YAML
  const frontmatter = Object.fromEntries(
    Object.entries(taskData).filter(([, value]) => value !== undefined)
  );
  
  let content = description || '';
  
  // Add refinement section if present
  if (refinement) {
    content += '\n\n## Refinement\n\n' + refinement;
  }
  
  // Add comments section if there are any
  if (comments.length > 0) {
    content += '\n\n## Comments\n\n';
    for (const comment of comments) {
      const date = new Date(comment.created_at).toISOString().replace('T', ' ').slice(0, -5);
      content += `### ${comment.author} — ${date}\n${comment.content}\n\n`;
    }
  }
  
  const fileContent = matter.stringify(content, frontmatter);
  const filePath = path.join(TASKS_DIR, `${task.id}.md`);
  
  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.writeFile(filePath, fileContent, 'utf8');
}

export async function readTask(id: string): Promise<{ task: Task; comments: Comment[] } | null> {
  try {
    const filePath = path.join(TASKS_DIR, `${id}.md`);
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsed = matter(fileContent);
    
    // Split content into description, refinement, and comments
    const rawContent = parsed.content;
    const refinementMatch = rawContent.match(/\n## Refinement\n\n([\s\S]*?)(?=\n## Comments|$)/);
    const descriptionPart = rawContent.split('\n## Refinement')[0].split('\n## Comments')[0].trim();
    
    const task: Task = {
      ...parsed.data as Omit<Task, 'description'>,
      id, // Always use filename-derived id as source of truth
      description: descriptionPart || undefined,
      refinement: refinementMatch ? refinementMatch[1].trim() : undefined,
    } as Task;
    
    // Parse comments from content
    const comments: Comment[] = [];
    const commentsMatch = parsed.content.match(/## Comments\n\n([\s\S]*)/);
    if (commentsMatch) {
      const commentsContent = commentsMatch[1];
      const commentMatches = commentsContent.matchAll(/### (.+?) — (.+?)\n([\s\S]*?)(?=\n### |$)/g);
      
      let commentId = 0;
      for (const match of commentMatches) {
        const [, author, dateStr, content] = match;
        comments.push({
          id: `${id}-comment-${commentId++}`,
          task_id: id,
          author,
          content: content.trim(),
          created_at: new Date(dateStr + 'Z').toISOString()
        });
      }
    }
    
    return { task, comments };
  } catch (error) {
    return null;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    const filePath = path.join(TASKS_DIR, `${id}.md`);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

export async function listTaskFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(TASKS_DIR);
    return files.filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  } catch (error) {
    return [];
  }
}

// Agent storage
export async function writeAgent(agent: Agent): Promise<void> {
  await ensureDataDirs();
  const filePath = path.join(AGENTS_DIR, `${agent.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(agent, null, 2), 'utf8');
}

export async function readAgent(id: string): Promise<Agent | null> {
  try {
    const filePath = path.join(AGENTS_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

export async function listAgents(): Promise<Agent[]> {
  try {
    await ensureDataDirs();
    const files = await fs.readdir(AGENTS_DIR);
    const agents: Agent[] = [];
    
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const agent = await readAgent(file.slice(0, -5));
      if (agent) agents.push(agent);
    }
    
    return agents;
  } catch (error) {
    return [];
  }
}

export async function deleteAgent(id: string): Promise<boolean> {
  try {
    const filePath = path.join(AGENTS_DIR, `${id}.json`);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

// Activity log (append-only JSONL)
export async function appendActivity(activity: ActivityEntry): Promise<void> {
  await ensureDataDirs();
  const line = JSON.stringify(activity) + '\n';
  await fs.appendFile(ACTIVITY_FILE, line, 'utf8');
}

export async function readActivity(filters?: {
  taskId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityEntry[]> {
  try {
    const content = await fs.readFile(ACTIVITY_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    let activities: ActivityEntry[] = lines.map(line => JSON.parse(line)).reverse(); // newest first
    
    // Apply filters
    if (filters?.taskId) {
      activities = activities.filter(a => a.task_id === filters.taskId);
    }
    if (filters?.agentId) {
      activities = activities.filter(a => a.agent_id === filters.agentId);
    }
    
    // Apply pagination
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 100;
    
    return activities.slice(offset, offset + limit);
  } catch (error) {
    return [];
  }
}

// Board state
export async function writeBoardState(state: BoardState): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(BOARD_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function readBoardState(): Promise<BoardState> {
  try {
    const content = await fs.readFile(BOARD_STATE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return {}; // Default empty state
  }
}

// Task index for fast queries
export async function writeIndex(index: TaskIndex): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

export async function readIndex(): Promise<TaskIndex> {
  try {
    const content = await fs.readFile(INDEX_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return { tasks: [], last_updated: new Date().toISOString() };
  }
}

// Rebuild index from task files
export async function rebuildIndex(): Promise<TaskIndex> {
  const taskIds = await listTaskFiles();
  const tasks = [];
  
  for (const id of taskIds) {
    const result = await readTask(id);
    if (result) {
      const { task } = result;
      tasks.push({
        id: task.id,
        status: task.status,
        assignee: task.assignee,
        project_id: task.project_id,
        priority: task.priority,
        updated_at: task.updated_at,
        title: task.title
      });
    }
  }
  
  const index: TaskIndex = {
    tasks,
    last_updated: new Date().toISOString()
  };
  
  await writeIndex(index);
  return index;
}

// Utility: Check if storage is initialized
export async function isStorageInitialized(): Promise<boolean> {
  try {
    await fs.access(DATA_DIR);
    return true;
  } catch {
    return false;
  }
}