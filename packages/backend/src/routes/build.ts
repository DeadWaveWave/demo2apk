import { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'path';
import { addBuildJob, BuildJobData } from '../services/queue.js';
import { saveUploadedFile, initStorage } from '../services/storage.js';
import type { ServerConfig } from '../index.js';

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

  /**
   * POST /api/build/html
   * Upload HTML file to build APK
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/html', async (request, reply) => {
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
    const appName = fields.appName?.value || 'MyVibeApp';
    const appId = fields.appId?.value;

    // Generate task ID
    const taskId = nanoid(12);

    try {
      // Save uploaded file
      const fileBuffer = await data.toBuffer();
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

      fastify.log.info({ taskId, appName, type: 'html' }, 'Build job created');

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      fastify.log.error({ error, taskId }, 'Failed to create build job');
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
  }>('/zip', async (request, reply) => {
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
    const appName = fields.appName?.value || 'MyReactApp';
    const appId = fields.appId?.value || 'com.example.reactapp';

    // Generate task ID
    const taskId = nanoid(12);

    try {
      // Save uploaded file
      const fileBuffer = await data.toBuffer();
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

      fastify.log.info({ taskId, appName, type: 'zip' }, 'Build job created');

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      fastify.log.error({ error, taskId }, 'Failed to create build job');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create build job',
      });
    }
  });
};

