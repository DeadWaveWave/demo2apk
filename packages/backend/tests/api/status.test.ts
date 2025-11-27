import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, ServerConfig } from '../../src/index.js';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

describe('Status API', () => {
  let app: FastifyInstance;
  let testConfig: Partial<ServerConfig>;
  let testBuildsDir: string;

  beforeAll(async () => {
    testBuildsDir = path.join(os.tmpdir(), `demo2apk-test-status-${Date.now()}`);
    await fs.ensureDir(testBuildsDir);

    testConfig = {
      port: 0,
      buildsDir: testBuildsDir,
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      mockBuild: true,
      rateLimitMax: 100,
    };

    app = await createServer(testConfig);
  });

  afterAll(async () => {
    await app.close();
    await fs.remove(testBuildsDir);
  });

  describe('GET /api/build/:taskId/status', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/build/nonexistent123/status',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });

    it('should return status for valid task ID format', async () => {
      // Even without a real task, the endpoint should handle it gracefully
      const response = await app.inject({
        method: 'GET',
        url: '/api/build/abc123xyz789/status',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('not found');
    });
  });

  describe('GET /api/build/:taskId/download', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/build/nonexistent123/download',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });
  });

  describe('DELETE /api/build/:taskId', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/build/nonexistent123',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });
  });

  describe('GET /api/build/:taskId/logs', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/build/nonexistent123/logs',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });
  });
});

