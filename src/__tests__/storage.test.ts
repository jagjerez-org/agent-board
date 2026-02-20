import { describe, it, expect, afterEach } from 'vitest';
import { Task, Comment, Agent } from '@/lib/types';
import * as storage from '@/lib/storage';
import { cleanupTestDir } from './setup';

describe('File Storage', () => {
  afterEach(async () => {
    await cleanupTestDir();
  });

  describe('Task Storage', () => {
    it('should write and read a task', async () => {
      const task: Task = {
        id: 'test-task-1',
        title: 'Test Task',
        description: 'This is a test task',
        status: 'backlog',
        priority: 'medium',
        sort_order: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        labels: ['test', 'example']
      };

      await storage.writeTask(task);
      const result = await storage.readTask('test-task-1');
      
      expect(result).toBeDefined();
      expect(result?.task).toEqual(task);
      expect(result?.comments).toEqual([]);
    });

    it('should write and read a task with comments', async () => {
      const task: Task = {
        id: 'test-task-2',
        title: 'Test Task with Comments',
        status: 'backlog',
        priority: 'medium',
        sort_order: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const comments: Comment[] = [
        {
          id: 'comment-1',
          task_id: 'test-task-2',
          author: 'user',
          content: 'This is a test comment',
          created_at: '2023-01-01T01:00:00Z'
        },
        {
          id: 'comment-2',
          task_id: 'test-task-2',
          author: 'worker-opus',
          content: 'Agent response',
          created_at: '2023-01-01T02:00:00Z'
        }
      ];

      await storage.writeTask(task, comments);
      const result = await storage.readTask('test-task-2');
      
      expect(result).toBeDefined();
      expect(result?.task.title).toBe(task.title);
      expect(result?.comments).toHaveLength(2);
      expect(result?.comments[0].content).toBe('This is a test comment');
    });

    it('should list task files', async () => {
      const task1: Task = {
        id: 'task-1',
        title: 'Task 1',
        status: 'backlog',
        priority: 'medium',
        sort_order: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      const task2: Task = {
        id: 'task-2',
        title: 'Task 2',
        status: 'todo',
        priority: 'high',
        sort_order: 1,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      await storage.writeTask(task1);
      await storage.writeTask(task2);

      const taskIds = await storage.listTaskFiles();
      expect(taskIds).toContain('task-1');
      expect(taskIds).toContain('task-2');
      expect(taskIds).toHaveLength(2);
    });

    it('should delete a task', async () => {
      const task: Task = {
        id: 'delete-test',
        title: 'Delete Test',
        status: 'backlog',
        priority: 'medium',
        sort_order: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      };

      await storage.writeTask(task);
      expect(await storage.readTask('delete-test')).toBeDefined();

      const deleted = await storage.deleteTask('delete-test');
      expect(deleted).toBe(true);
      expect(await storage.readTask('delete-test')).toBeNull();
    });
  });

  describe('Agent Storage', () => {
    it('should write and read an agent', async () => {
      const agent: Agent = {
        id: 'worker-test',
        name: 'Test Worker',
        model: 'test-model',
        role: 'test',
        status: 'idle',
        capabilities: ['testing', 'validation']
      };

      await storage.writeAgent(agent);
      const result = await storage.readAgent('worker-test');
      
      expect(result).toEqual(agent);
    });

    it('should list agents', async () => {
      const agent1: Agent = {
        id: 'agent-1',
        name: 'Agent 1',
        status: 'idle'
      };

      const agent2: Agent = {
        id: 'agent-2',
        name: 'Agent 2',
        status: 'busy'
      };

      await storage.writeAgent(agent1);
      await storage.writeAgent(agent2);

      const agents = await storage.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('agent-1');
      expect(agents.map(a => a.id)).toContain('agent-2');
    });
  });

  describe('Index Management', () => {
    it('should rebuild index from task files', async () => {
      const tasks: Task[] = [
        {
          id: 'index-test-1',
          title: 'Index Test 1',
          status: 'backlog',
          priority: 'high',
          sort_order: 0,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
        },
        {
          id: 'index-test-2',
          title: 'Index Test 2',
          status: 'in_progress',
          priority: 'medium',
          assignee: 'worker-opus',
          sort_order: 1,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T01:00:00Z',
        }
      ];

      // Write tasks
      for (const task of tasks) {
        await storage.writeTask(task);
      }

      // Rebuild index
      const index = await storage.rebuildIndex();

      // Check we have at least our test tasks
      expect(index.tasks.length).toBeGreaterThanOrEqual(2);
      expect(index.tasks.find(t => t.id === 'index-test-1')?.status).toBe('backlog');
      expect(index.tasks.find(t => t.id === 'index-test-2')?.assignee).toBe('worker-opus');
    });
  });
});