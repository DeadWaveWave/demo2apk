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
   * Upload HTML file to build APK (with optional icon)
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/html', { ...rateLimitConfig }, async (request, reply) => {
    // Generate task ID early for logging
    const taskId = nanoid(12);
    const logger: Logger = request.logger;

    // Parse multipart form data
    let htmlFile: { buffer: Buffer; filename: string } | null = null;
    let iconFile: { buffer: Buffer; filename: string } | null = null;
    let appName = '';
    let appId: string | undefined;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'file') {
          htmlFile = { buffer, filename: part.filename };
        } else if (part.fieldname === 'icon') {
          // Validate icon file type
          const iconFilename = part.filename.toLowerCase();
          if (iconFilename.endsWith('.png') || iconFilename.endsWith('.jpg') || iconFilename.endsWith('.jpeg')) {
            iconFile = { buffer, filename: part.filename };
          }
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'appName') {
          appName = String(part.value || '').trim();
        } else if (part.fieldname === 'appId') {
          appId = String(part.value || '').trim() || undefined;
        }
      }
    }

    if (!htmlFile) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded. Please upload an HTML file.',
      });
    }

    // Validate file type
    const filename = htmlFile.filename.toLowerCase();
    if (!filename.endsWith('.html') && !filename.endsWith('.htm')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Please upload an HTML file (.html or .htm).',
      });
    }

    // Use filename as app name if not provided
    const uploadedBaseName = path.parse(htmlFile.filename).name;
    appName = appName || uploadedBaseName || 'MyVibeApp';

    const fileSize = htmlFile.buffer.length;

    logger.info('HTML file received', {
      taskId,
      appName,
      fileName: htmlFile.filename,
      fileSize,
      hasIcon: !!iconFile,
    });

    try {
      // Save uploaded HTML file
      const filePath = await saveUploadedFile(
        htmlFile.buffer,
        htmlFile.filename,
        taskId,
        { buildsDir: config.buildsDir }
      );

      // Save icon file if provided
      let iconPath: string | undefined;
      if (iconFile) {
        iconPath = await saveUploadedFile(
          iconFile.buffer,
          `icon-${iconFile.filename}`,
          taskId,
          { buildsDir: config.buildsDir }
        );
      }

      // Create job data
      const jobData: BuildJobData = {
        taskId,
        type: 'html',
        filePath,
        appName,
        appId,
        iconPath,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, 'html', { fileSize, appId, hasIcon: !!iconPath });

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
   * Upload ZIP project to build APK (with optional icon)
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/zip', { ...rateLimitConfig }, async (request, reply) => {
    // Generate task ID early for logging
    const taskId = nanoid(12);
    const logger: Logger = request.logger;

    // Parse multipart form data
    let zipFile: { buffer: Buffer; filename: string } | null = null;
    let iconFile: { buffer: Buffer; filename: string } | null = null;
    let appName = '';
    let appId: string | undefined;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'file') {
          zipFile = { buffer, filename: part.filename };
        } else if (part.fieldname === 'icon') {
          // Validate icon file type
          const iconFilename = part.filename.toLowerCase();
          if (iconFilename.endsWith('.png') || iconFilename.endsWith('.jpg') || iconFilename.endsWith('.jpeg')) {
            iconFile = { buffer, filename: part.filename };
          }
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'appName') {
          appName = String(part.value || '').trim();
        } else if (part.fieldname === 'appId') {
          appId = String(part.value || '').trim() || undefined;
        }
      }
    }

    if (!zipFile) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No file uploaded. Please upload a ZIP file.',
      });
    }

    // Validate file type
    const filename = zipFile.filename.toLowerCase();
    if (!filename.endsWith('.zip')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Please upload a ZIP file.',
      });
    }

    // Use filename as app name if not provided
    const uploadedBaseName = path.parse(zipFile.filename).name;
    appName = appName || uploadedBaseName || 'MyReactApp';
    appId = appId || 'com.example.reactapp';

    const fileSize = zipFile.buffer.length;

    logger.info('ZIP file received', {
      taskId,
      appName,
      appId,
      fileName: zipFile.filename,
      fileSize,
      hasIcon: !!iconFile,
    });

    try {
      // Save uploaded ZIP file
      const filePath = await saveUploadedFile(
        zipFile.buffer,
        zipFile.filename,
        taskId,
        { buildsDir: config.buildsDir }
      );

      // Save icon file if provided
      let iconPath: string | undefined;
      if (iconFile) {
        iconPath = await saveUploadedFile(
          iconFile.buffer,
          `icon-${iconFile.filename}`,
          taskId,
          { buildsDir: config.buildsDir }
        );
      }

      // Create job data
      const jobData: BuildJobData = {
        taskId,
        type: 'zip',
        filePath,
        appName,
        appId,
        iconPath,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, 'zip', { fileSize, appId, hasIcon: !!iconPath });

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
