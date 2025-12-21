// Load environment variables from .env file (must be first!)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (2 levels up from dist/index.js)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try loading from monorepo root (3 levels up)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { buildRoutes } from './routes/build.js';
import { statusRoutes } from './routes/status.js';
import { getRedisConnection } from './services/queue.js';
import { createLogger, createRequestLogger, Logger } from './utils/logger.js';

// 声明 Fastify 扩展类型
declare module 'fastify' {
  interface FastifyRequest {
    logger: Logger;
    startTime: number;
  }
}

export interface ServerConfig {
  port: number;
  host: string;
  buildsDir: string;
  pwaDir: string;
  pwaEnabled: boolean;
  pwaHostSuffix?: string;
  pwaUrlScheme?: string;
  redisUrl: string;
  maxFileSize: number;
  rateLimitMax: number;
  rateLimitWindow: string;
  rateLimitEnabled: boolean;
  mockBuild: boolean;
  fileRetentionHours: number;
}

// Resolve builds directory to absolute path (required by fastifyStatic)
function resolveBuildsDir(): string {
  const dir = process.env.BUILDS_DIR || 'builds';
  // If already absolute, use as-is; otherwise resolve relative to cwd
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

function resolvePwaDir(buildsDir: string): string {
  const dir = process.env.PWA_DIR || path.join(buildsDir, 'pwa-sites');
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

const defaultBuildsDir = resolveBuildsDir();

const defaultConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  buildsDir: defaultBuildsDir,
  pwaDir: resolvePwaDir(defaultBuildsDir),
  pwaEnabled: process.env.PWA_ENABLED === 'true',
  pwaHostSuffix: process.env.PWA_HOST_SUFFIX,
  pwaUrlScheme: process.env.PWA_URL_SCHEME || 'https',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '31457280', 10), // 30MB
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '5', 10),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 hour',
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false', // Enabled by default, set to 'false' to disable
  mockBuild: process.env.MOCK_BUILD === 'true',
  fileRetentionHours: parseInt(process.env.FILE_RETENTION_HOURS || '2', 10), // 2 hours default
};

export async function createServer(config: Partial<ServerConfig> = {}) {
  const merged = { ...defaultConfig, ...config };
  const finalConfig: ServerConfig = {
    ...merged,
    buildsDir: path.isAbsolute(merged.buildsDir) ? merged.buildsDir : path.resolve(process.cwd(), merged.buildsDir),
    pwaDir: path.isAbsolute(merged.pwaDir) ? merged.pwaDir : path.resolve(process.cwd(), merged.pwaDir),
  };

  // 根 Logger 用于启动日志
  const rootLogger = createLogger({ component: 'api' });

  const fastify = Fastify({
    // 禁用 Fastify 内置的请求日志，使用我们自己的
    disableRequestLogging: true,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:mm:ss.SSS',
          ignore: 'pid,hostname,reqId,req,res,responseTime',
        },
      },
    },
  });

  // 为每个请求添加追踪 Logger
  fastify.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
    request.logger = createRequestLogger(fastify.log, {
      ip: request.ip,
      method: request.method,
      url: request.url,
      headers: request.headers as Record<string, string | string[] | undefined>,
    });
  });

  // 请求完成时记录日志（单条精简日志）
  fastify.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - request.startTime;
    // 跳过健康检查和静态文件
    if (request.url === '/health' || request.url.startsWith('/downloads/')) return;

    request.logger.requestEnd(request.method, request.url, reply.statusCode, durationMs);
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
        message: `构建次数已达上限（每小时最多 ${context.max} 次）。请 ${context.after} 后再试。`,
        retryAfter: context.after,
      }),
    });
    rootLogger.info('Rate limiting enabled', {
      maxRequests: finalConfig.rateLimitMax,
      window: finalConfig.rateLimitWindow,
    });
  } else {
    rootLogger.warn('Rate limiting DISABLED (dev mode)');
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

  // Server configuration endpoint (for frontend feature detection)
  fastify.get('/api/config', async () => ({
    pwaEnabled: finalConfig.pwaEnabled,
    maxFileSize: finalConfig.maxFileSize,
    rateLimitEnabled: finalConfig.rateLimitEnabled,
    rateLimitMax: finalConfig.rateLimitMax,
    fileRetentionHours: finalConfig.fileRetentionHours,
  }));

  // API info endpoint
  fastify.get('/api', async () => ({
    name: 'Demo2APK API',
    version: '2.0.0',
    endpoints: {
      'POST /api/build/html': 'Upload HTML file to build APK (optional: publishPwa=true)',
      'POST /api/build/zip': 'Upload ZIP project to build APK (optional: publishPwa=true)',
      'GET /api/build/:taskId/status': 'Get build task status',
      'GET /api/build/:taskId/download': 'Download built APK',
      'DELETE /api/build/:taskId': 'Cancel/cleanup build task',
      'GET /api/config': 'Get server configuration',
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
  const startupLogger = createLogger({ component: 'api' });
  const server = await createServer();

  try {
    await server.listen({
      port: defaultConfig.port,
      host: defaultConfig.host
    });
    startupLogger.info('Demo2APK API started', {
      host: defaultConfig.host,
      port: defaultConfig.port,
      url: `http://${defaultConfig.host}:${defaultConfig.port}`,
    });
  } catch (err) {
    startupLogger.error('Failed to start server', err);
    process.exit(1);
  }
}
