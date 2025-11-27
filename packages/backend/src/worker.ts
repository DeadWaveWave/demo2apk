import { Job } from 'bullmq';
import path from 'path';
import fs from 'fs-extra';
import {
  createBuildWorker,
  BuildJobData,
  BuildJobResult,
  getRedisConnection,
} from './services/queue.js';
import { buildHtmlToApk, buildReactToApk } from '@demo2apk/core';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MOCK_BUILD = process.env.MOCK_BUILD === 'true';
const MOCK_APK_PATH = process.env.MOCK_APK_PATH || './test-assets/mock.apk';
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(process.cwd(), 'builds');
const FILE_RETENTION_HOURS = parseInt(process.env.FILE_RETENTION_HOURS || '2', 10);

/**
 * Process a build job
 */
async function processBuildJob(job: Job<BuildJobData, BuildJobResult>): Promise<BuildJobResult> {
  const { type, filePath, appName, appId, outputDir, taskId } = job.data;

  console.log(`\n🔨 Processing job ${taskId} (${type}): ${appName}`);

  // Update progress callback
  const onProgress = async (message: string, percent?: number) => {
    await job.updateProgress({
      message,
      percent: percent ?? 0,
    });
  };

  // Mock build for testing
  if (MOCK_BUILD) {
    console.log('⚠️  MOCK_BUILD enabled - returning fake APK');

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

    return {
      success: true,
      apkPath: mockApkDest,
      duration: 3500,
    };
  }

  try {
    if (type === 'html') {
      const result = await buildHtmlToApk({
        htmlPath: filePath,
        appName,
        appId,
        outputDir,
        onProgress,
      });

      return result;
    } else if (type === 'zip') {
      const result = await buildReactToApk({
        zipPath: filePath,
        appName,
        appId,
        outputDir,
        onProgress,
      });

      return result;
    } else {
      return {
        success: false,
        error: `Unknown build type: ${type}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Build failed for job ${taskId}:`, message);

    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Cleanup old build files
 */
async function cleanupOldBuilds() {
  const retentionMs = FILE_RETENTION_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let cleanedCount = 0;

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
          console.log(`🗑️  Cleaned up expired: ${entry.name}`);
        }
      } catch (err) {
        // Ignore errors for individual files
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleanup complete: removed ${cleanedCount} expired items`);
    }
  } catch (err) {
    console.error('❌ Cleanup error:', err);
  }
}

// Start the worker
console.log('🚀 Starting Demo2APK Worker...');
console.log(`📡 Redis URL: ${REDIS_URL}`);
console.log(`🔧 Mock Build: ${MOCK_BUILD}`);
console.log(`🕐 File Retention: ${FILE_RETENTION_HOURS} hours`);

const worker = createBuildWorker(REDIS_URL, processBuildJob);

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n⏹️  Shutting down worker...');
  await worker.close();

  const redis = getRedisConnection(REDIS_URL);
  redis.disconnect();

  console.log('👋 Worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Run cleanup on startup
cleanupOldBuilds();

// Schedule periodic cleanup (every 30 minutes)
const cleanupInterval = setInterval(cleanupOldBuilds, 30 * 60 * 1000);

console.log('✅ Worker is running and waiting for jobs...');
console.log(`🧹 Auto-cleanup scheduled every 30 minutes (retention: ${FILE_RETENTION_HOURS}h)`);

