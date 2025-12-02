import { FastifyPluginAsync } from 'fastify';
import path from 'path';
import { nanoid } from 'nanoid';
import { addBuildJob, BuildJobData } from '../services/queue.js';
import { saveUploadedFile, initStorage } from '../services/storage.js';
import type { ServerConfig } from '../index.js';
import type { Logger } from '../utils/logger.js';

interface BuildRouteOptions {
  config: ServerConfig;
}

interface BuildRequestBody {
  appName?: string;
  appId?: string;
}

export const buildRoutes: FastifyPluginAsync<BuildRouteOptions> = async (fastify, options) => {
  const { config } = options;
  
  // Initialize storage
  await initStorage({ buildsDir: config.buildsDir });

  // Rate limit config for build endpoints only
  const rateLimitConfig = config.rateLimitEnabled ? {
    config: {
      rateLimit: {
        max: config.rateLimitMax,
        timeWindow: config.rateLimitWindow,
      }
    }
  } : {};

  /**
   * POST /api/build/html
   * Upload HTML file to build APK
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/html', { ...rateLimitConfig }, async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded. Please upload an HTML file.',
      });
    }

    // Validate file type
    const filename = data.filename.toLowerCase();
    if (!filename.endsWith('.html') && !filename.endsWith('.htm')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Please upload an HTML file (.html or .htm).',
      });
    }

    // Get form fields
    const fields = data.fields as Record<string, { value?: string }>;
    const uploadedBaseName = path.parse(data.filename).name;
    const appName = (fields.appName?.value || uploadedBaseName || 'MyVibeApp').trim();
    const appId = fields.appId?.value;

    // Generate task ID
    const taskId = nanoid(12);

    // 获取请求的 Logger
    const logger: Logger = request.logger;
    const fileBuffer = await data.toBuffer();
    const fileSize = fileBuffer.length;

    logger.info('HTML file received', {
      taskId,
      appName,
      fileName: data.filename,
      fileSize,
    });

    try {
      // Save uploaded file
      const filePath = await saveUploadedFile(
        fileBuffer,
        data.filename,
        taskId,
        { buildsDir: config.buildsDir }
      );

      // Create job data
      const jobData: BuildJobData = {
        taskId,
        type: 'html',
        filePath,
        appName,
        appId,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, 'html', { fileSize, appId });

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      logger.error('Failed to create HTML build job', error, { taskId, appName });
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create build job',
      });
    }
  });

  /**
   * POST /api/build/zip
   * Upload ZIP project to build APK
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/zip', { ...rateLimitConfig }, async (request, reply) => {
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded. Please upload a ZIP file.',
      });
    }

    // Validate file type
    const filename = data.filename.toLowerCase();
    if (!filename.endsWith('.zip')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Please upload a ZIP file.',
      });
    }

    // Get form fields
    const fields = data.fields as Record<string, { value?: string }>;
    // Default app name to the ZIP base filename when not provided
    const uploadedBaseName = path.parse(data.filename).name;
    const appName = (fields.appName?.value || uploadedBaseName || 'MyReactApp').trim();
    const appId = fields.appId?.value || 'com.example.reactapp';

    // Generate task ID
    const taskId = nanoid(12);

    // 获取请求的 Logger
    const logger: Logger = request.logger;
    const fileBuffer = await data.toBuffer();
    const fileSize = fileBuffer.length;

    logger.info('ZIP file received', {
      taskId,
      appName,
      appId,
      fileName: data.filename,
      fileSize,
    });

    try {
      // Save uploaded file
      const filePath = await saveUploadedFile(
        fileBuffer,
        data.filename,
        taskId,
        { buildsDir: config.buildsDir }
      );

      // Create job data
      const jobData: BuildJobData = {
        taskId,
        type: 'zip',
        filePath,
        appName,
        appId,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, 'zip', { fileSize, appId });

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      logger.error('Failed to create ZIP build job', error, { taskId, appName, appId });
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create build job',
      });
    }
  });
};
