import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRoutes } from './routes/build.js';
import { statusRoutes } from './routes/status.js';
import { getRedisConnection } from './services/queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  port: number;
  host: string;
  buildsDir: string;
  redisUrl: string;
  maxFileSize: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  rateLimitEnabled: boolean;
  mockBuild: boolean;
  fileRetentionHours: number;
}

const defaultConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  buildsDir: process.env.BUILDS_DIR || path.join(process.cwd(), 'builds'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '5', 10),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 hour',
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false', // Enabled by default, set to 'false' to disable
  mockBuild: process.env.MOCK_BUILD === 'true',
  fileRetentionHours: parseInt(process.env.FILE_RETENTION_HOURS || '2', 10), // 2 hours default
};

export async function createServer(config: Partial<ServerConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };

  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE'],
  });

  // Register multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: finalConfig.maxFileSize,
    },
  });

  // Register rate limiting (can be disabled in dev mode)
  // ONLY limit build endpoints (POST requests), not status queries
  const redis = getRedisConnection(finalConfig.redisUrl);
  if (finalConfig.rateLimitEnabled) {
    await fastify.register(rateLimit, {
      global: false, // Disable global rate limiting, we'll apply it selectively
      max: finalConfig.rateLimitMax,
      timeWindow: finalConfig.rateLimitWindow,
      redis,
      keyGenerator: (request) => {
        // Use X-Forwarded-For header if behind a proxy, otherwise use IP
        return request.headers['x-forwarded-for']?.toString().split(',')[0] || 
               request.ip;
      },
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `构建次数已达上限。每 ${context.after} 最多可构建 ${context.max} 次，请稍后再试。`,
        retryAfter: context.after,
      }),
    });
    console.log(`🛡️  Rate limiting enabled: ${finalConfig.rateLimitMax} builds per ${finalConfig.rateLimitWindow}`);
  } else {
    console.log('⚠️  Rate limiting DISABLED (dev mode)');
  }

  // Serve static files (built APKs)
  await fastify.register(fastifyStatic, {
    root: finalConfig.buildsDir,
    prefix: '/downloads/',
    decorateReply: false,
  });

  // Health check endpoint
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // API info endpoint
  fastify.get('/api', async () => ({
    name: 'Demo2APK API',
    version: '2.0.0',
    endpoints: {
      'POST /api/build/html': 'Upload HTML file to build APK',
      'POST /api/build/zip': 'Upload ZIP project to build APK',
      'GET /api/build/:taskId/status': 'Get build task status',
      'GET /api/build/:taskId/download': 'Download built APK',
      'DELETE /api/build/:taskId': 'Cancel/cleanup build task',
    },
  }));

  // Register routes
  await fastify.register(buildRoutes, { 
    prefix: '/api/build',
    config: finalConfig,
  });
  
  await fastify.register(statusRoutes, { 
    prefix: '/api/build',
    config: finalConfig,
  });

  // Decorate with config
  fastify.decorate('config', finalConfig);

  return fastify;
}

// Start server if running directly
const isMain = process.argv[1]?.endsWith('index.js') || 
               process.argv[1]?.endsWith('index.ts');

if (isMain) {
  const server = await createServer();

  try {
    await server.listen({ 
      port: defaultConfig.port, 
      host: defaultConfig.host 
    });
    console.log(`🚀 Demo2APK API running at http://${defaultConfig.host}:${defaultConfig.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

