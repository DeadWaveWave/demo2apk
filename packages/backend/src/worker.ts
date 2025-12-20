// Load environment variables from .env file (must be first!)
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
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
import { cleanupTask } from './services/storage.js';
import { buildHtmlToApk, buildReactToApk, buildHtmlProjectToApk } from '@demo2apk/core';
import { createLogger, Logger } from './utils/logger.js';

// Worker 根 Logger
const logger = createLogger({ component: 'worker' });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MOCK_BUILD = process.env.MOCK_BUILD === 'true';
const MOCK_APK_PATH = process.env.MOCK_APK_PATH || './test-assets/mock.apk';
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(process.cwd(), 'builds');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(os.tmpdir(), 'demo2apk-uploads');
const FILE_RETENTION_HOURS = parseInt(process.env.FILE_RETENTION_HOURS || '2', 10);
const FILE_CLEANUP_ENABLED = process.env.FILE_CLEANUP_ENABLED !== 'false';
const FILE_CLEANUP_INTERVAL_MINUTES = parseInt(process.env.FILE_CLEANUP_INTERVAL_MINUTES || '30', 10);
const CLEANUP_UPLOADS_ON_COMPLETE = process.env.CLEANUP_UPLOADS_ON_COMPLETE !== 'false';

/**
 * Process a build job
 */
async function processBuildJob(job: Job<BuildJobData, BuildJobResult>): Promise<BuildJobResult> {
  const { type, filePath, appName, appId, appVersion, iconPath, permissions, outputDir, taskId, zipProjectRoot } = job.data;
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

  try {
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

    let result: BuildJobResult;

    if (type === 'html') {
      result = await buildHtmlToApk({
        htmlPath: filePath,
        appName,
        appId,
        appVersion: appVersion || '1.0.0',
        iconPath,
        permissions,
        outputDir,
        taskId,  // Pass taskId for unique APK filename
        onProgress,
      });
    } else if (type === 'zip') {
      result = await buildReactToApk({
        zipPath: filePath,
        appName,
        appId,
        appVersion: appVersion || '1.0.0',
        iconPath,
        permissions,
        outputDir,
        taskId,  // Pass taskId for unique APK filename
        onProgress,
      });
    } else if (type === 'html-project') {
      // Multi-file HTML project from ZIP (no npm build needed)
      result = await buildHtmlProjectToApk({
        zipPath: filePath,
        projectRoot: zipProjectRoot,
        appName,
        appId,
        appVersion: appVersion || '1.0.0',
        iconPath,
        permissions,
        outputDir,
        taskId,
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
  } finally {
    if (CLEANUP_UPLOADS_ON_COMPLETE) {
      try {
        await cleanupTask(taskId, appName, { buildsDir: outputDir, uploadsDir: UPLOADS_DIR });
      } catch (error) {
        jobLogger.warn('Post-build cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // If the API created a temporary ZIP in BUILDS_DIR for React wrapping, remove it after the build.
      // (Uploaded ZIPs live in UPLOADS_DIR and are already removed by cleanupTask above.)
      if (filePath && path.dirname(filePath) === outputDir && filePath.endsWith('-project.zip')) {
        await fs.remove(filePath).catch(() => {});
      }
    }
  }
}

/**
 * Cleanup old build files
 */
async function cleanupOldBuilds() {
  const cleanupLogger = logger.child({ operation: 'cleanup' });
  const retentionMs = FILE_RETENTION_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let cleanedBuilds = 0;
  let cleanedUploads = 0;
  const cleanedItems: string[] = [];

  try {
    const targets = [
      { dir: BUILDS_DIR, label: 'builds' as const },
      { dir: UPLOADS_DIR, label: 'uploads' as const },
    ];

    for (const target of targets) {
      if (!await fs.pathExists(target.dir)) continue;

      const entries = await fs.readdir(target.dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(target.dir, entry.name);

        try {
          const stats = await fs.stat(entryPath);
          const age = now - stats.mtimeMs;

          if (age > retentionMs) {
            if (entry.isDirectory()) {
              await fs.remove(entryPath);
            } else {
              await fs.unlink(entryPath);
            }

            if (target.label === 'builds') cleanedBuilds++;
            else cleanedUploads++;

            if (cleanedItems.length < 10) {
              cleanedItems.push(`${target.label}/${entry.name}`);
            }
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }

    if (cleanedBuilds > 0 || cleanedUploads > 0) {
      cleanupLogger.info('Cleanup completed', {
        retentionHours: FILE_RETENTION_HOURS,
        removedBuilds: cleanedBuilds,
        removedUploads: cleanedUploads,
        items: cleanedItems, // 已限制到前 10 个
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

if (FILE_CLEANUP_ENABLED) {
  // Run cleanup on startup
  cleanupOldBuilds();

  // Schedule periodic cleanup
  setInterval(cleanupOldBuilds, FILE_CLEANUP_INTERVAL_MINUTES * 60 * 1000);

  logger.info('Worker ready', {
    status: 'waiting_for_jobs',
    cleanupIntervalMinutes: FILE_CLEANUP_INTERVAL_MINUTES,
    fileRetentionHours: FILE_RETENTION_HOURS,
  });
} else {
  logger.warn('File cleanup DISABLED via FILE_CLEANUP_ENABLED=false', {
    status: 'waiting_for_jobs',
    fileRetentionHours: FILE_RETENTION_HOURS,
  });
}
