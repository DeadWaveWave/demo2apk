// Load environment variables from .env file (must be first!)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (2 levels up from dist/worker.js)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try loading from monorepo root (3 levels up)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { Job } from 'bullmq';
import fs from 'fs-extra';
import {
  createBuildWorker,
  BuildJobData,
  BuildJobResult,
  getRedisConnection,
} from './services/queue.js';
import { buildHtmlToApk, buildReactToApk } from '@demo2apk/core';
import { createLogger, Logger } from './utils/logger.js';

// Worker 根 Logger
const logger = createLogger({ component: 'worker' });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MOCK_BUILD = process.env.MOCK_BUILD === 'true';
const MOCK_APK_PATH = process.env.MOCK_APK_PATH || './test-assets/mock.apk';
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(process.cwd(), 'builds');
const FILE_RETENTION_HOURS = parseInt(process.env.FILE_RETENTION_HOURS || '2', 10);

/**
 * Process a build job
 */
async function processBuildJob(job: Job<BuildJobData, BuildJobResult>): Promise<BuildJobResult> {
  const { type, filePath, appName, appId, iconPath, outputDir, taskId } = job.data;
  const startTime = Date.now();

  // 为此任务创建子 Logger
  const jobLogger = logger.child({ taskId, appName, buildType: type, appId });
  jobLogger.buildStart(taskId, appName, type);

  // Update progress callback
  const onProgress = async (message: string, percent?: number) => {
    await job.updateProgress({
      message,
      percent: percent ?? 0,
    });
  };

  // Mock build for testing
  if (MOCK_BUILD) {
    jobLogger.warn('MOCK_BUILD enabled - returning fake APK');

    await onProgress('Starting mock build...', 10);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await onProgress('Processing files...', 30);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await onProgress('Building APK...', 60);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await onProgress('Finalizing...', 90);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create a fake APK file if it doesn't exist
    const mockApkDest = path.join(outputDir, `${appName}.apk`);

    if (await fs.pathExists(MOCK_APK_PATH)) {
      await fs.copy(MOCK_APK_PATH, mockApkDest);
    } else {
      // Create a minimal file for testing
      await fs.ensureDir(outputDir);
      await fs.writeFile(mockApkDest, 'MOCK APK FILE FOR TESTING');
    }

    await onProgress('Build completed!', 100);
    const duration = Date.now() - startTime;

    jobLogger.buildComplete(taskId, appName, true, duration, { apkPath: mockApkDest, mock: true });

    return {
      success: true,
      apkPath: mockApkDest,
      duration,
    };
  }

  try {
    let result: BuildJobResult;

    if (type === 'html') {
      result = await buildHtmlToApk({
        htmlPath: filePath,
        appName,
        appId,
        iconPath,
        outputDir,
        onProgress,
      });
    } else if (type === 'zip') {
      result = await buildReactToApk({
        zipPath: filePath,
        appName,
        appId,
        iconPath,
        outputDir,
        taskId,  // Pass taskId for unique APK filename
        onProgress,
      });
    } else {
      jobLogger.error('Unknown build type', new Error(`Unknown build type: ${type}`));
      return {
        success: false,
        error: `Unknown build type: ${type}`,
      };
    }

    const duration = Date.now() - startTime;
    
    if (result.success) {
      // 获取 APK 文件大小
      let apkSize: number | undefined;
      if (result.apkPath && await fs.pathExists(result.apkPath)) {
        const stats = await fs.stat(result.apkPath);
        apkSize = stats.size;
      }
      jobLogger.buildComplete(taskId, appName, true, duration, { apkPath: result.apkPath, apkSize });
    } else {
      jobLogger.buildComplete(taskId, appName, false, duration, { error: result.error });
    }

    return { ...result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    jobLogger.error('Build failed with exception', error, { durationMs: duration });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
    };
  }
}

/**
 * Cleanup old build files
 */
async function cleanupOldBuilds() {
  const cleanupLogger = logger.child({ operation: 'cleanup' });
  const retentionMs = FILE_RETENTION_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let cleanedCount = 0;
  const cleanedItems: string[] = [];

  try {
    if (!await fs.pathExists(BUILDS_DIR)) {
      return;
    }

    const entries = await fs.readdir(BUILDS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(BUILDS_DIR, entry.name);

      try {
        const stats = await fs.stat(entryPath);
        const age = now - stats.mtimeMs;

        if (age > retentionMs) {
          if (entry.isDirectory()) {
            await fs.remove(entryPath);
          } else {
            await fs.unlink(entryPath);
          }
          cleanedCount++;
          cleanedItems.push(entry.name);
        }
      } catch (err) {
        // Ignore errors for individual files
      }
    }

    if (cleanedCount > 0) {
      cleanupLogger.info('Cleanup completed', {
        removedCount: cleanedCount,
        retentionHours: FILE_RETENTION_HOURS,
        items: cleanedItems.slice(0, 10), // 只记录前10个
      });
    }
  } catch (err) {
    cleanupLogger.error('Cleanup failed', err);
  }
}

// Start the worker
logger.info('Worker starting', {
  redisUrl: REDIS_URL.replace(/\/\/.*@/, '//*****@'), // 隐藏密码
  mockBuild: MOCK_BUILD,
  fileRetentionHours: FILE_RETENTION_HOURS,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
});

const worker = createBuildWorker(REDIS_URL, processBuildJob, logger);

// Handle graceful shutdown
const shutdown = async () => {
  logger.info('Worker shutting down...');
  await worker.close();

  const redis = getRedisConnection(REDIS_URL);
  redis.disconnect();

  logger.info('Worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Run cleanup on startup
cleanupOldBuilds();

// Schedule periodic cleanup (every 30 minutes)
setInterval(cleanupOldBuilds, 30 * 60 * 1000);

logger.info('Worker ready', {
  status: 'waiting_for_jobs',
  cleanupIntervalMinutes: 30,
  fileRetentionHours: FILE_RETENTION_HOURS,
});

