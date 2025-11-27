import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from '../utils/logger.js';

export type BuildType = 'html' | 'zip';

export interface BuildJobData {
  taskId: string;
  type: BuildType;
  filePath: string;
  appName: string;
  appId?: string;
  outputDir: string;
  createdAt: string;
}

export interface BuildJobProgress {
  message: string;
  percent: number;
}

export interface BuildJobResult {
  success: boolean;
  apkPath?: string;
  error?: string;
  duration?: number;
}

let redisConnection: Redis | null = null;
let buildQueue: Queue<BuildJobData, BuildJobResult> | null = null;

/**
 * Get or create Redis connection
 */
export function getRedisConnection(redisUrl: string): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

/**
 * Get or create build queue
 */
export function getBuildQueue(redisUrl: string): Queue<BuildJobData, BuildJobResult> {
  if (!buildQueue) {
    const connection = getRedisConnection(redisUrl);
    buildQueue = new Queue<BuildJobData, BuildJobResult>('build', {
      connection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600 * 24, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 3600 * 24 * 7, // Keep failed jobs for 7 days
        },
        attempts: 1, // No automatic retries for builds
      },
    });
  }
  return buildQueue;
}

/**
 * Add a build job to the queue
 */
export async function addBuildJob(
  redisUrl: string,
  data: BuildJobData
): Promise<Job<BuildJobData, BuildJobResult>> {
  const queue = getBuildQueue(redisUrl);
  
  const job = await queue.add(data.taskId, data, {
    jobId: data.taskId,
  });
  
  return job;
}

/**
 * Get job by task ID
 */
export async function getJob(
  redisUrl: string,
  taskId: string
): Promise<Job<BuildJobData, BuildJobResult> | undefined> {
  const queue = getBuildQueue(redisUrl);
  return queue.getJob(taskId);
}

/**
 * Get job status
 */
export async function getJobStatus(
  redisUrl: string,
  taskId: string
): Promise<{
  status: 'pending' | 'active' | 'completed' | 'failed' | 'not_found';
  progress?: BuildJobProgress;
  result?: BuildJobResult;
  error?: string;
  createdAt?: string;
}> {
  const job = await getJob(redisUrl, taskId);
  
  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();
  const progress = job.progress as BuildJobProgress | undefined;
  const createdAt = job.data?.createdAt;

  switch (state) {
    case 'completed':
      return {
        status: 'completed',
        progress,
        result: job.returnvalue,
        createdAt,
      };
    case 'failed':
      return {
        status: 'failed',
        progress,
        error: job.failedReason,
        createdAt,
      };
    case 'active':
      return {
        status: 'active',
        progress,
        createdAt,
      };
    case 'waiting':
    case 'delayed':
    case 'prioritized':
      return {
        status: 'pending',
        createdAt,
      };
    default:
      return { status: 'not_found' };
  }
}

/**
 * Remove a job from the queue
 */
export async function removeJob(redisUrl: string, taskId: string): Promise<boolean> {
  const job = await getJob(redisUrl, taskId);
  
  if (!job) {
    return false;
  }

  const state = await job.getState();
  
  // Can only remove completed, failed, or waiting jobs
  if (state === 'active') {
    return false;
  }

  await job.remove();
  return true;
}

/**
 * Create a build worker
 */
export function createBuildWorker(
  redisUrl: string,
  processor: (job: Job<BuildJobData, BuildJobResult>) => Promise<BuildJobResult>,
  logger?: Logger
): Worker<BuildJobData, BuildJobResult> {
  const connection = getRedisConnection(redisUrl);
  
  const worker = new Worker<BuildJobData, BuildJobResult>(
    'build',
    processor,
    {
      connection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    }
  );

  worker.on('completed', (job, result) => {
    const jobData = job.data;
    if (logger) {
      if (result?.success) {
        logger.info('Job completed', {
          jobId: job.id,
          taskId: jobData.taskId,
          appName: jobData.appName,
          success: true,
          durationMs: result.duration,
        });
      } else {
        logger.warn('Job completed with build failure', {
          jobId: job.id,
          taskId: jobData.taskId,
          appName: jobData.appName,
          success: false,
          error: result?.error,
        });
      }
    }
  });

  worker.on('failed', (job, err) => {
    if (logger && job) {
      logger.error('Job execution failed', err, {
        jobId: job.id,
        taskId: job.data.taskId,
        appName: job.data.appName,
      });
    }
  });

  worker.on('progress', (job, progress) => {
    const p = progress as BuildJobProgress;
    if (logger) {
      // 显示步骤说明和百分比
      logger.debug(`[${p.percent}%] ${p.message}`, {
        taskId: job.data.taskId,
      });
    }
  });

  worker.on('error', (err) => {
    if (logger) {
      logger.error('Worker error', err);
    }
  });

  return worker;
}

/**
 * Close all connections
 */
export async function closeConnections(): Promise<void> {
  if (buildQueue) {
    await buildQueue.close();
    buildQueue = null;
  }
  
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }
}

