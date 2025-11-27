import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  getBuildQueue,
  addBuildJob,
  getJob,
  getJobStatus,
  removeJob,
  closeConnections,
  BuildJobData,
} from '../../src/services/queue.js';

// Skip if no Redis available
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const skipIfNoRedis = process.env.CI ? describe.skip : describe;

skipIfNoRedis('Queue Service', () => {
  beforeAll(async () => {
    // Ensure queue is initialized
    getBuildQueue(REDIS_URL);
  });

  afterAll(async () => {
    await closeConnections();
  });

  describe('addBuildJob', () => {
    it('should add a job to the queue', async () => {
      const jobData: BuildJobData = {
        taskId: `test-${Date.now()}`,
        type: 'html',
        filePath: '/tmp/test.html',
        appName: 'TestApp',
        outputDir: '/tmp/builds',
        createdAt: new Date().toISOString(),
      };

      const job = await addBuildJob(REDIS_URL, jobData);

      expect(job).toBeDefined();
      expect(job.id).toBe(jobData.taskId);
      expect(job.data.type).toBe('html');
      expect(job.data.appName).toBe('TestApp');

      // Cleanup
      await job.remove();
    });
  });

  describe('getJob', () => {
    it('should return undefined for non-existent job', async () => {
      const job = await getJob(REDIS_URL, 'nonexistent-job-id');
      expect(job).toBeUndefined();
    });

    it('should return job for existing job ID', async () => {
      const taskId = `test-get-${Date.now()}`;
      const jobData: BuildJobData = {
        taskId,
        type: 'zip',
        filePath: '/tmp/test.zip',
        appName: 'TestReactApp',
        outputDir: '/tmp/builds',
        createdAt: new Date().toISOString(),
      };

      await addBuildJob(REDIS_URL, jobData);
      const job = await getJob(REDIS_URL, taskId);

      expect(job).toBeDefined();
      expect(job?.data.appName).toBe('TestReactApp');

      // Cleanup
      await job?.remove();
    });
  });

  describe('getJobStatus', () => {
    it('should return not_found for non-existent job', async () => {
      const status = await getJobStatus(REDIS_URL, 'nonexistent-status-id');
      expect(status.status).toBe('not_found');
    });

    it('should return pending for new job', async () => {
      const taskId = `test-status-${Date.now()}`;
      const jobData: BuildJobData = {
        taskId,
        type: 'html',
        filePath: '/tmp/test.html',
        appName: 'TestApp',
        outputDir: '/tmp/builds',
        createdAt: new Date().toISOString(),
      };

      await addBuildJob(REDIS_URL, jobData);
      const status = await getJobStatus(REDIS_URL, taskId);

      expect(status.status).toBe('pending');

      // Cleanup
      const job = await getJob(REDIS_URL, taskId);
      await job?.remove();
    });
  });

  describe('removeJob', () => {
    it('should return false for non-existent job', async () => {
      const result = await removeJob(REDIS_URL, 'nonexistent-remove-id');
      expect(result).toBe(false);
    });

    it('should remove existing job', async () => {
      const taskId = `test-remove-${Date.now()}`;
      const jobData: BuildJobData = {
        taskId,
        type: 'html',
        filePath: '/tmp/test.html',
        appName: 'TestApp',
        outputDir: '/tmp/builds',
        createdAt: new Date().toISOString(),
      };

      await addBuildJob(REDIS_URL, jobData);
      const result = await removeJob(REDIS_URL, taskId);

      expect(result).toBe(true);

      // Verify removed
      const job = await getJob(REDIS_URL, taskId);
      expect(job).toBeUndefined();
    });
  });
});

