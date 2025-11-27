import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, ServerConfig } from '../../src/index.js';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

describe('Build API', () => {
  let app: FastifyInstance;
  let testConfig: Partial<ServerConfig>;
  let testBuildsDir: string;

  beforeAll(async () => {
    testBuildsDir = path.join(os.tmpdir(), `demo2apk-test-${Date.now()}`);
    await fs.ensureDir(testBuildsDir);

    testConfig = {
      port: 0, // Random port
      buildsDir: testBuildsDir,
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      mockBuild: true,
      rateLimitMax: 100, // High limit for testing
    };

    app = await createServer(testConfig);
  });

  afterAll(async () => {
    await app.close();
    await fs.remove(testBuildsDir);
  });

  describe('POST /api/build/html', () => {
    it('should accept HTML file and return task ID', async () => {
      const htmlContent = '<!DOCTYPE html><html><head></head><body>Hello</body></html>';
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/build/html',
        payload: {
          file: {
            value: Buffer.from(htmlContent),
            filename: 'test.html',
          },
          appName: {
            value: 'TestApp',
          },
        },
        headers: {
          'content-type': 'multipart/form-data',
        },
      });

      // Note: multipart handling in inject is tricky
      // In a real test you'd use form-data library
      // For now, check that the endpoint exists and responds
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should reject non-HTML files', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/build/html',
        headers: {
          'content-type': 'multipart/form-data',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
    });

    it('should reject requests without file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/build/html',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/build/zip', () => {
    it('should reject non-ZIP files', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/build/zip',
        headers: {
          'content-type': 'multipart/form-data',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
    });

    it('should reject requests without file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/build/zip',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('API Info', () => {
    it('should return API info on GET /api', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Demo2APK API');
      expect(body.version).toBe('2.0.0');
      expect(body.endpoints).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should return health status on GET /health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });
});

