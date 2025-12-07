import { FastifyPluginAsync } from 'fastify';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { addBuildJob, BuildJobData } from '../services/queue.js';
import { saveUploadedFile, initStorage } from '../services/storage.js';
import type { ServerConfig } from '../index.js';
import type { Logger } from '../utils/logger.js';
import { detectCodeType, wrapReactComponent, createProjectZip } from '@demo2apk/core';

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

    // Accept HTML, JS, JSX, TS, TSX files
    const filename = htmlFile.filename.toLowerCase();
    const validExtensions = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx'];
    const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
    
    if (!hasValidExtension) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Please upload an HTML, JS, JSX, TS, or TSX file.',
      });
    }

    // Use filename as app name if not provided
    const uploadedBaseName = path.parse(htmlFile.filename).name;
    appName = appName || uploadedBaseName || 'MyVibeApp';

    const fileSize = htmlFile.buffer.length;
    const fileContent = htmlFile.buffer.toString('utf8');
    
    // Detect actual code type from content (not just extension)
    const detection = detectCodeType(fileContent);

    logger.info('File received for analysis', {
      taskId,
      appName,
      fileName: htmlFile.filename,
      fileSize,
      detectedType: detection.type,
      confidence: detection.confidence,
      hasIcon: !!iconFile,
    });

    try {
      let filePath: string;
      let buildType: 'html' | 'zip' = 'html';
      
      // If content is a React component, wrap it into a project
      if (detection.type === 'react-component' && detection.confidence >= 50) {
        logger.info('Wrapping React component from uploaded file', { taskId, appName });
        
        const wrapResult = await wrapReactComponent({
          code: fileContent,
          appName: appName || 'App',
          outputDir: path.join(os.tmpdir(), `react-wrap-${taskId}`),
        });

        // Create ZIP from the project
        const zipPath = path.join(config.buildsDir, `${taskId}-project.zip`);
        await createProjectZip(wrapResult.projectDir, zipPath);

        filePath = zipPath;
        buildType = 'zip';
        appId = appId || 'com.example.reactapp';

        logger.info('React component wrapped successfully', {
          taskId,
          projectDir: wrapResult.projectDir,
          zipPath,
          isTypeScript: wrapResult.isTypeScript,
        });
      } else {
        // Save as HTML file
        filePath = await saveUploadedFile(
          htmlFile.buffer,
          htmlFile.filename.endsWith('.html') || htmlFile.filename.endsWith('.htm') 
            ? htmlFile.filename 
            : `${uploadedBaseName}.html`,
          taskId,
          { buildsDir: config.buildsDir }
        );
      }

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
        type: buildType,
        filePath,
        appName,
        appId,
        iconPath,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, buildType, { 
        fileSize, 
        appId, 
        hasIcon: !!iconPath,
        detectedType: detection.type,
        confidence: detection.confidence,
      });

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        detectedType: detection.type,
        confidence: detection.confidence,
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      logger.error('Failed to create build job', error, { taskId, appName });
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

  /**
   * POST /api/build/code
   * Upload raw code (HTML or React component) to build APK
   * Automatically detects code type and handles accordingly
   */
  fastify.post<{
    Body: BuildRequestBody;
  }>('/code', { ...rateLimitConfig }, async (request, reply) => {
    const taskId = nanoid(12);
    const logger: Logger = request.logger;

    // Parse multipart form data
    let codeContent = '';
    let iconFile: { buffer: Buffer; filename: string } | null = null;
    let appName = '';
    let appId: string | undefined;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'code') {
          codeContent = buffer.toString('utf8');
        } else if (part.fieldname === 'icon') {
          const iconFilename = part.filename.toLowerCase();
          if (iconFilename.endsWith('.png') || iconFilename.endsWith('.jpg') || iconFilename.endsWith('.jpeg')) {
            iconFile = { buffer, filename: part.filename };
          }
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'code') {
          codeContent = String(part.value || '');
        } else if (part.fieldname === 'appName') {
          appName = String(part.value || '').trim();
        } else if (part.fieldname === 'appId') {
          appId = String(part.value || '').trim() || undefined;
        }
      }
    }

    if (!codeContent.trim()) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'No code provided. Please paste your code.',
      });
    }

    // Detect code type
    const detection = detectCodeType(codeContent);
    
    logger.info('Code received for analysis', {
      taskId,
      appName,
      codeLength: codeContent.length,
      detectedType: detection.type,
      confidence: detection.confidence,
      hints: detection.hints,
    });

    try {
      let filePath: string;
      let buildType: 'html' | 'zip';

      if (detection.type === 'react-component' && detection.confidence >= 50) {
        // Wrap React component into a full project
        logger.info('Wrapping React component into project', { taskId, appName });
        
        const wrapResult = await wrapReactComponent({
          code: codeContent,
          appName: appName || 'App',
          outputDir: path.join(os.tmpdir(), `react-wrap-${taskId}`),
        });

        // Create ZIP from the project
        const zipPath = path.join(config.buildsDir, `${taskId}-project.zip`);
        await createProjectZip(wrapResult.projectDir, zipPath);

        // Save the ZIP file reference
        filePath = zipPath;
        buildType = 'zip';
        appName = appName || 'ReactApp';
        appId = appId || 'com.example.reactapp';

        logger.info('React component wrapped successfully', {
          taskId,
          projectDir: wrapResult.projectDir,
          zipPath,
          isTypeScript: wrapResult.isTypeScript,
        });
      } else {
        // Handle as HTML (either pure HTML or HTML with embedded React)
        const filename = `${appName || 'app'}.html`;
        filePath = await saveUploadedFile(
          Buffer.from(codeContent, 'utf8'),
          filename,
          taskId,
          { buildsDir: config.buildsDir }
        );
        buildType = 'html';
        appName = appName || 'MyVibeApp';
      }

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
        type: buildType,
        filePath,
        appName,
        appId,
        iconPath,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, buildType, {
        codeType: detection.type,
        confidence: detection.confidence,
        hasIcon: !!iconPath,
      });

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        detectedType: detection.type,
        confidence: detection.confidence,
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
      };
    } catch (error) {
      logger.error('Failed to create code build job', error, { taskId, appName });
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create build job',
      });
    }
  });
};
