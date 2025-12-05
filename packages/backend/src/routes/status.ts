import { FastifyPluginAsync } from 'fastify';
import path from 'path';
import fs from 'fs-extra';
import { getJobStatus, getJob, removeJob } from '../services/queue.js';
import { apkExists, getApkSize, cleanupTask } from '../services/storage.js';
import type { ServerConfig } from '../index.js';
import type { Logger } from '../utils/logger.js';

interface StatusRouteOptions {
  config: ServerConfig;
}

interface TaskParams {
  taskId: string;
}

export const statusRoutes: FastifyPluginAsync<StatusRouteOptions> = async (fastify, options) => {
  const { config } = options;

  /**
   * GET /api/build/:taskId/status
   * Get build task status
   */
  fastify.get<{
    Params: TaskParams;
  }>('/:taskId/status', async (request, reply) => {
    const { taskId } = request.params;

    const jobStatus = await getJobStatus(config.redisUrl, taskId);
    const retentionHours = config.fileRetentionHours;
    let expiresAt: string | undefined;

    if (jobStatus.createdAt) {
      const createdTime = new Date(jobStatus.createdAt).getTime();
      const expiryTime = createdTime + retentionHours * 60 * 60 * 1000;
      if (!Number.isNaN(expiryTime)) {
        expiresAt = new Date(expiryTime).toISOString();
      }
    }

    if (jobStatus.status === 'not_found') {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Task ${taskId} not found`,
      });
    }

    // Determine the actual status - job can be "completed" but build failed
    let actualStatus = jobStatus.status;
    
    // If job completed but build failed, report as failed
    if (jobStatus.status === 'completed' && jobStatus.result && !jobStatus.result.success) {
      actualStatus = 'failed';
    }
    
    const response: Record<string, unknown> = {
      taskId,
      status: actualStatus,
    };

    if (jobStatus.appName) {
      response.fileName = jobStatus.appName;
    }

    if (expiresAt) {
      response.expiresAt = expiresAt;
    }
    response.retentionHours = retentionHours;

    if (jobStatus.progress) {
      response.progress = jobStatus.progress;
    }

    // Include queue position for pending jobs
    if (jobStatus.status === 'pending') {
      if (jobStatus.queuePosition !== undefined) {
        response.queuePosition = jobStatus.queuePosition;
      }
      if (jobStatus.queueTotal !== undefined) {
        response.queueTotal = jobStatus.queueTotal;
      }
    }

    if (jobStatus.status === 'completed' && jobStatus.result) {
      response.result = {
        success: jobStatus.result.success,
        duration: jobStatus.result.duration,
      };

      if (jobStatus.result.success && jobStatus.result.apkPath) {
        response.downloadUrl = `/api/build/${taskId}/download`;
        response.apkSize = await getApkSize(jobStatus.result.apkPath).catch(() => 0);
      } else if (jobStatus.result.error) {
        response.error = jobStatus.result.error;
      }
    }

    if (jobStatus.status === 'failed') {
      response.error = jobStatus.error;
    }

    return response;
  });

  /**
   * GET /api/build/:taskId/download
   * Download built APK
   */
  fastify.get<{
    Params: TaskParams;
  }>('/:taskId/download', async (request, reply) => {
    const { taskId } = request.params;

    const jobStatus = await getJobStatus(config.redisUrl, taskId);

    if (jobStatus.status === 'not_found') {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Task ${taskId} not found`,
      });
    }

    if (jobStatus.status !== 'completed') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Task ${taskId} is not completed yet. Current status: ${jobStatus.status}`,
      });
    }

    if (!jobStatus.result?.success || !jobStatus.result.apkPath) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Build failed, no APK available for download',
      });
    }

    const apkPath = jobStatus.result.apkPath;

    if (!(await apkExists(apkPath))) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'APK file not found. It may have been cleaned up.',
      });
    }

    // Get original filename without taskId suffix for user download
    // Internal format: "appName--taskId.apk", user sees: "appName.apk"
    let filename = path.basename(apkPath);
    const taskIdMatch = filename.match(/^(.+)--[a-zA-Z0-9]+\.apk$/);
    if (taskIdMatch) {
      filename = `${taskIdMatch[1]}.apk`;
    }
    
    // Handle non-ASCII filenames (RFC 5987)
    // Provide both ASCII fallback and UTF-8 encoded filename
    const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_'); // Replace non-ASCII with underscore
    const encodedFilename = encodeURIComponent(filename);
    
    return reply
      .header('Content-Type', 'application/vnd.android.package-archive')
      .header('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`)
      .send(fs.createReadStream(apkPath));
  });

  /**
   * DELETE /api/build/:taskId
   * Cancel or cleanup a build task
   */
  fastify.delete<{
    Params: TaskParams;
  }>('/:taskId', async (request, reply) => {
    const { taskId } = request.params;

    const job = await getJob(config.redisUrl, taskId);

    if (!job) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Task ${taskId} not found`,
      });
    }

    const state = await job.getState();

    if (state === 'active') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Cannot cancel a task that is currently building. Please wait for it to complete.',
      });
    }

    // Get app name for cleanup
    const appName = job.data.appName;

    // Remove job from queue
    const removed = await removeJob(config.redisUrl, taskId);

    if (!removed) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to remove task from queue',
      });
    }

    // Cleanup files
    await cleanupTask(taskId, appName, { buildsDir: config.buildsDir });

    const logger: Logger = request.logger;
    logger.info('Task deleted', { taskId, appName });

    return {
      message: `Task ${taskId} has been deleted`,
      taskId,
    };
  });

  /**
   * GET /api/build/:taskId/logs
   * Get build logs (if available)
   */
  fastify.get<{
    Params: TaskParams;
  }>('/:taskId/logs', async (request, reply) => {
    const { taskId } = request.params;

    const jobStatus = await getJobStatus(config.redisUrl, taskId);

    if (jobStatus.status === 'not_found') {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Task ${taskId} not found`,
      });
    }

    // For now, just return progress history
    // In a full implementation, you might store logs in Redis or a file
    const response: Record<string, unknown> = {
      taskId,
      status: jobStatus.status,
    };

    if (jobStatus.progress) {
      response.currentProgress = jobStatus.progress;
    }

    if (jobStatus.error) {
      response.error = jobStatus.error;
    }

    return response;
  });
};

