import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as taskStore from '@/lib/task-store';
import { cleanupTestDir } from './setup';

describe('Task Store', () => {
  afterEach(async () => {
    await cleanupTestDir();
  });

  describe('Task CRUD Operations', () => {
    it('should create a task', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Task description',
        priority: 'high' as const,
        story_points: 5,
        labels: ['feature', 'urgent']
      };

      const task = await taskStore.createTask(taskData);

      expect(task.id).toBeDefined();
      expect(task.title).toBe('New Task');
      expect(task.description).toBe('Task description');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('backlog');
      expect(task.story_points).toBe(5);
      expect(task.labels).toEqual(['feature', 'urgent']);
    });

    it('should get a task by ID', async () => {
      const created = await taskStore.createTask({
        title: 'Get Test Task',
        description: 'Test getting a task'
      });

      const result = await taskStore.getTask(created.id);

      expect(result).toBeDefined();
      expect(result?.task.id).toBe(created.id);
      expect(result?.task.title).toBe('Get Test Task');
      expect(result?.comments).toEqual([]);
    });

    it('should update a task', async () => {
      const created = await taskStore.createTask({
        title: 'Original Title',
        priority: 'low'
      });

      const updated = await taskStore.updateTask(created.id, {
        title: 'Updated Title',
        priority: 'critical',
        assignee: 'worker-opus'
      });

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.priority).toBe('critical');
      expect(updated?.assignee).toBe('worker-opus');
    });

    it('should delete a task', async () => {
      const created = await taskStore.createTask({
        title: 'Delete Me'
      });

      const deleted = await taskStore.deleteTask(created.id);
      expect(deleted).toBe(true);

      const result = await taskStore.getTask(created.id);
      expect(result).toBeNull();
    });
  });

  describe('Task State Transitions', () => {
    it('should allow valid transitions', async () => {
      const task = await taskStore.createTask({
        title: 'Transition Test'
      });

      // backlog → refinement
      const refined = await taskStore.moveTask(task.id, 'refinement');
      expect(refined?.status).toBe('refinement');

      // refinement → pending_approval
      const pending = await taskStore.moveTask(task.id, 'pending_approval');
      expect(pending?.status).toBe('pending_approval');

      // pending_approval → todo
      const todo = await taskStore.moveTask(task.id, 'todo');
      expect(todo?.status).toBe('todo');

      // todo → in_progress
      const inProgress = await taskStore.moveTask(task.id, 'in_progress');
      expect(inProgress?.status).toBe('in_progress');

      // in_progress → review
      const review = await taskStore.moveTask(task.id, 'review');
      expect(review?.status).toBe('review');

      // review → done
      const done = await taskStore.moveTask(task.id, 'done');
      expect(done?.status).toBe('done');
    });

    it('should reject invalid transitions', async () => {
      const task = await taskStore.createTask({
        title: 'Invalid Transition Test'
      });

      // backlog → done (invalid)
      await expect(
        taskStore.moveTask(task.id, 'done')
      ).rejects.toThrow('Invalid transition');
      
      // backlog → in_progress (invalid)
      await expect(
        taskStore.moveTask(task.id, 'in_progress')
      ).rejects.toThrow('Invalid transition');
    });

    it('should allow transitions back to backlog', async () => {
      const task = await taskStore.createTask({
        title: 'Backlog Return Test'
      });

      // Move to in_progress
      await taskStore.moveTask(task.id, 'refinement');
      await taskStore.moveTask(task.id, 'pending_approval');
      await taskStore.moveTask(task.id, 'todo');
      await taskStore.moveTask(task.id, 'in_progress');

      // Should be able to return to backlog
      const backlogged = await taskStore.moveTask(task.id, 'backlog');
      expect(backlogged?.status).toBe('backlog');
    });
  });

  describe('Task Assignment', () => {
    it('should assign a task to an agent', async () => {
      const task = await taskStore.createTask({
        title: 'Assignment Test'
      });

      const assigned = await taskStore.assignTask(task.id, 'worker-opus');
      expect(assigned?.assignee).toBe('worker-opus');
    });
  });

  describe('Task Comments', () => {
    it('should add a comment to a task', async () => {
      const task = await taskStore.createTask({
        title: 'Comment Test'
      });

      const comment = await taskStore.addComment(
        task.id,
        'user',
        'This is a test comment'
      );

      expect(comment.task_id).toBe(task.id);
      expect(comment.author).toBe('user');
      expect(comment.content).toBe('This is a test comment');
      expect(comment.id).toBeDefined();
      expect(comment.created_at).toBeDefined();
    });
  });

  describe('PR Linking', () => {
    it('should link a PR to a task', async () => {
      const task = await taskStore.createTask({
        title: 'PR Link Test'
      });

      const prUrl = 'https://github.com/user/repo/pull/123';
      const updated = await taskStore.linkPR(task.id, prUrl);

      expect(updated?.pr_url).toBe(prUrl);
      expect(updated?.pr_status).toBe('open');
    });
  });

  describe('Task Filtering and Listing', () => {
    beforeEach(async () => {
      // Create test tasks
      await taskStore.createTask({
        title: 'High Priority Task',
        priority: 'high',
        assignee: 'worker-opus',
        labels: ['urgent', 'feature']
      });

      const task2 = await taskStore.createTask({
        title: 'Medium Priority Task',
        priority: 'medium',
        assignee: 'worker-heavy',
        labels: ['bug']
      });
      await taskStore.moveTask(task2.id, 'refinement');

      await taskStore.createTask({
        title: 'Unassigned Task',
        priority: 'low',
        labels: ['documentation']
      });
    });

    it('should filter tasks by status', async () => {
      const backlogTasks = await taskStore.listTasks({ status: 'backlog' });
      const refinementTasks = await taskStore.listTasks({ status: 'refinement' });

      expect(backlogTasks).toHaveLength(2);
      expect(refinementTasks).toHaveLength(1);
      expect(refinementTasks[0].title).toBe('Medium Priority Task');
    });

    it('should filter tasks by assignee', async () => {
      const opusTasks = await taskStore.listTasks({ assignee: 'worker-opus' });
      const heavyTasks = await taskStore.listTasks({ assignee: 'worker-heavy' });

      expect(opusTasks).toHaveLength(1);
      expect(opusTasks[0].title).toBe('High Priority Task');
      expect(heavyTasks).toHaveLength(1);
      expect(heavyTasks[0].title).toBe('Medium Priority Task');
    });

    it('should filter tasks by priority', async () => {
      const highTasks = await taskStore.listTasks({ priority: 'high' });
      const lowTasks = await taskStore.listTasks({ priority: 'low' });

      expect(highTasks).toHaveLength(1);
      expect(highTasks[0].title).toBe('High Priority Task');
      expect(lowTasks).toHaveLength(1);
      expect(lowTasks[0].title).toBe('Unassigned Task');
    });

    it('should filter tasks by labels', async () => {
      const urgentTasks = await taskStore.listTasks({ labels: ['urgent'] });
      const bugTasks = await taskStore.listTasks({ labels: ['bug'] });

      expect(urgentTasks).toHaveLength(1);
      expect(urgentTasks[0].title).toBe('High Priority Task');
      expect(bugTasks).toHaveLength(1);
      expect(bugTasks[0].title).toBe('Medium Priority Task');
    });
  });
});