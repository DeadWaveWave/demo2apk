import { FastifyPluginAsync } from 'fastify';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { addBuildJob, BuildJobData } from '../services/queue.js';
import { saveUploadedFile, initStorage } from '../services/storage.js';
import type { ServerConfig } from '../index.js';
import type { Logger } from '../utils/logger.js';
import {
  detectCodeType,
  wrapReactComponent,
  createProjectZip,
  detectZipProjectType,
  getZipProjectTypeLabel,
} from '@demo2apk/core';
import { resolveAppIdentityFromUpload, resolveAppIdentityFromCode } from '../utils/appIdentity.js';
import { generatePwaSiteId } from '../utils/pwaSite.js';

interface BuildRouteOptions {
  config: ServerConfig;
}

interface BuildRequestBody {
  appName?: string;
  appId?: string;
  appVersion?: string;
  permissions?: string[];  // Custom Android permissions
  publishPwa?: string;
}

/**
 * Validate version format: must be x.x.x (three numbers separated by exactly two dots)
 */
function validateVersion(version: string): boolean {
  if (!version || !version.trim()) return true; // Empty is allowed (will use default)
  const versionRegex = /^\d+\.\d+\.\d+$/;
  return versionRegex.test(version.trim());
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(2))} ${sizes[i]}`;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) return code;
  if (typeof code === 'number') return String(code);
  return undefined;
}

function classifyCreateBuildJobError(
  error: unknown,
  maxFileSize: number
): { statusCode: number; error: string; message: string; code?: string; hint?: string } {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  // Fastify multipart size limits
  if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: 413,
      error: 'Payload Too Large',
      code,
      message: `File too large. Max size is ${formatBytes(maxFileSize)}.`,
      hint: 'Try compressing the ZIP or increasing MAX_FILE_SIZE.',
    };
  }

  // Disk full / FS issues
  if (code === 'ENOSPC') {
    return {
      statusCode: 507,
      error: 'Insufficient Storage',
      code,
      message: 'Server storage is full. Please try again later.',
      hint: 'Check /app/uploads, /app/builds and docker volume disk usage.',
    };
  }

  // Missing system binaries used by core helpers
  if (code === 'ENOENT' && /\b(zip|unzip)\b/i.test(message)) {
    return {
      statusCode: 500,
      error: 'Server Misconfigured',
      code,
      message: 'Server missing required system tool (zip/unzip).',
      hint: 'Ensure the backend image installs zip + unzip.',
    };
  }

  // Redis / queue issues (BullMQ)
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    /\b(MISCONF|OOM|READONLY)\b/i.test(message) ||
    /\b(redis|bullmq)\b/i.test(message)
  ) {
    return {
      statusCode: 503,
      error: 'Service Unavailable',
      code,
      message: 'Queue service unavailable. Please try again later.',
      hint: 'Check Redis health and available disk/memory.',
    };
  }

  return {
    statusCode: 500,
    error: 'Internal Server Error',
    code,
    message: 'Failed to create build job',
  };
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

    try {
      // Parse multipart form data
      let htmlFile: { buffer: Buffer; filename: string } | null = null;
      let iconFile: { buffer: Buffer; filename: string } | null = null;
      let appName = '';
      let appId: string | undefined;
      let appVersion: string | undefined;
      let permissions: string[] | undefined;
      let publishPwa = false;

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
          } else if (part.fieldname === 'appVersion') {
            const versionValue = String(part.value || '').trim();
            if (versionValue) {
              // Validate version format
              if (!validateVersion(versionValue)) {
                return reply.status(400).send({
                  error: 'Bad Request',
                  message: 'Invalid version format. Version must be in format x.x.x (e.g., 1.0.0)',
                });
              }
              appVersion = versionValue;
            }
          } else if (part.fieldname === 'permissions') {
            // Parse permissions as JSON array or comma-separated string
            const permValue = String(part.value || '').trim();
            if (permValue) {
              try {
                // Try parsing as JSON first
                const parsed = JSON.parse(permValue);
                permissions = Array.isArray(parsed) ? parsed : [permValue];
              } catch {
                // Fall back to comma-separated
                permissions = permValue.split(',').map(p => p.trim()).filter(Boolean);
              }
            }
          } else if (part.fieldname === 'publishPwa') {
            const raw = String(part.value || '').trim().toLowerCase();
            publishPwa = ['1', 'true', 'yes', 'on'].includes(raw);
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

      // Use filename as app name if not provided (for non-React HTML builds)
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

      let filePath: string;
      let buildType: 'html' | 'zip' = 'html';

      let pwaSiteId: string | undefined;

      // If content is a React component, wrap it into a project
      if (detection.type === 'react-component' && detection.confidence >= 50) {
        logger.info('Wrapping React component from uploaded file', { taskId, appName });

        // Normalize appName / appId for React project
        const identity = resolveAppIdentityFromUpload(appName, appId, htmlFile.filename, 'ReactApp');
        appName = identity.appName;
        appId = identity.appId;

        const wrapResult = await wrapReactComponent({
          code: fileContent,
          appName,
          outputDir: path.join(os.tmpdir(), `react-wrap-${taskId}`),
        });

        // Create ZIP from the project
        const zipPath = path.join(config.buildsDir, `${taskId}-project.zip`);
        await createProjectZip(wrapResult.projectDir, zipPath);

        filePath = zipPath;
        buildType = 'zip';

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

      if (publishPwa) {
        if (!config.pwaEnabled) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'PWA publishing is not enabled on this server',
          });
        }
        pwaSiteId = generatePwaSiteId(appName);
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
        appVersion: appVersion || '1.0.0', // Default to 1.0.0 if not provided
        iconPath,
        permissions,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
        ...(pwaSiteId ? { pwa: { siteId: pwaSiteId } } : {}),
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
        ...(pwaSiteId ? { pwaSiteId } : {}),
      };
    } catch (error) {
      logger.error('Failed to create build job', error, { taskId });
      const classified = classifyCreateBuildJobError(error, config.maxFileSize);
      return reply.status(classified.statusCode).send({
        error: classified.error,
        message: classified.message,
        taskId,
        traceId: logger.getTraceId(),
        code: classified.code,
        hint: classified.hint,
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
    let appName = '';
    let appId: string | undefined;
    let appVersion: string | undefined;
    let publishPwa = false;

    try {
      // Parse multipart form data
      let zipFile: { buffer: Buffer; filename: string } | null = null;
      let iconFile: { buffer: Buffer; filename: string } | null = null;
      let appVersion: string | undefined;
      let permissions: string[] | undefined;

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
          } else if (part.fieldname === 'appVersion') {
            const versionValue = String(part.value || '').trim();
            if (versionValue) {
              // Validate version format
              if (!validateVersion(versionValue)) {
                return reply.status(400).send({
                  error: 'Bad Request',
                  message: 'Invalid version format. Version must be in format x.x.x (e.g., 1.0.0)',
                });
              }
              appVersion = versionValue;
            }
          } else if (part.fieldname === 'permissions') {
            const permValue = String(part.value || '').trim();
            if (permValue) {
              try {
                const parsed = JSON.parse(permValue);
                permissions = Array.isArray(parsed) ? parsed : [permValue];
              } catch {
                permissions = permValue.split(',').map(p => p.trim()).filter(Boolean);
              }
            }
          } else if (part.fieldname === 'publishPwa') {
            const raw = String(part.value || '').trim().toLowerCase();
            publishPwa = ['1', 'true', 'yes', 'on'].includes(raw);
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

      // Normalize app identity (name + ID) based on upload
      const identity = resolveAppIdentityFromUpload(appName, appId, zipFile.filename, 'MyReactApp');
      appName = identity.appName;
      appId = identity.appId;

      const fileSize = zipFile.buffer.length;

      logger.info('ZIP file received', {
        taskId,
        appName,
        appId,
        fileName: zipFile.filename,
        fileSize,
        hasIcon: !!iconFile,
      });

      // Save uploaded ZIP file
      const filePath = await saveUploadedFile(
        zipFile.buffer,
        zipFile.filename,
        taskId,
        { buildsDir: config.buildsDir }
      );

      // Detect ZIP content type
      const zipDetection = await detectZipProjectType(filePath);

      // 精简版：生产环境主要关注类型与置信度
      logger.info('ZIP content type detected', {
        taskId,
        appName,
        fileName: zipFile.filename,
        fileSize,
        projectType: zipDetection.type,
        confidence: zipDetection.confidence,
        hasIcon: !!iconFile,
      });

      // 详细调试信息仅在需要时查看（debug 级别）
      logger.debug('ZIP content analysis details', {
        taskId,
        projectRoot: zipDetection.projectRoot,
        hasPackageJson: zipDetection.hasPackageJson,
        hasIndexHtml: zipDetection.hasIndexHtml,
        fileCount: zipDetection.fileCount,
        hints: zipDetection.hints,
      });

      // Determine build type based on detection
      let buildType: 'zip' | 'html-project';

      if (zipDetection.type === 'react-project') {
        // React/Vite project - needs npm build
        buildType = 'zip';
      } else if (zipDetection.type === 'html-project' || zipDetection.type === 'html-single') {
        // Static HTML project - direct Cordova packaging
        buildType = 'html-project';
      } else {
        // Unknown - try React builder as fallback if it has package.json
        buildType = zipDetection.hasPackageJson ? 'zip' : 'html-project';
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
      const pwaSiteId = publishPwa
        ? (config.pwaEnabled ? generatePwaSiteId(appName) : undefined)
        : undefined;

      if (publishPwa && !config.pwaEnabled) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'PWA publishing is not enabled on this server',
        });
      }

      const jobData: BuildJobData = {
        taskId,
        type: buildType,
        filePath,
        appName,
        appId,
        appVersion: appVersion || '1.0.0', // Default to 1.0.0 if not provided
        iconPath,
        permissions,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
        // Pass detection metadata for worker
        zipProjectRoot: zipDetection.projectRoot,
        ...(pwaSiteId ? { pwa: { siteId: pwaSiteId } } : {}),
      };

      // Add to queue
      await addBuildJob(config.redisUrl, jobData);

      logger.buildCreated(taskId, appName, buildType, {
        fileSize,
        appId,
        hasIcon: !!iconPath,
        detectedZipType: zipDetection.type,
        confidence: zipDetection.confidence,
      });

      return {
        taskId,
        message: 'Build job created successfully',
        status: 'pending',
        detectedProjectType: zipDetection.type,
        detectedProjectLabel: getZipProjectTypeLabel(zipDetection.type),
        confidence: zipDetection.confidence,
        buildApproach: buildType === 'zip' ? 'React/Vite Build' : 'Direct Cordova',
        statusUrl: `/api/build/${taskId}/status`,
        downloadUrl: `/api/build/${taskId}/download`,
        ...(pwaSiteId ? { pwaSiteId } : {}),
      };
    } catch (error) {
      logger.error('Failed to create ZIP build job', error, { taskId, appName, appId });
      const classified = classifyCreateBuildJobError(error, config.maxFileSize);
      return reply.status(classified.statusCode).send({
        error: classified.error,
        message: classified.message,
        taskId,
        traceId: logger.getTraceId(),
        code: classified.code,
        hint: classified.hint,
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
    let appName = '';
    let appId: string | undefined;
    let appVersion: string | undefined;
    let publishPwa = false;

    try {
      // Parse multipart form data
      let codeContent = '';
      let iconFile: { buffer: Buffer; filename: string } | null = null;
      let appVersion: string | undefined;
      let permissions: string[] | undefined;

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
          } else if (part.fieldname === 'appVersion') {
            const versionValue = String(part.value || '').trim();
            if (versionValue) {
              // Validate version format
              if (!validateVersion(versionValue)) {
                return reply.status(400).send({
                  error: 'Bad Request',
                  message: 'Invalid version format. Version must be in format x.x.x (e.g., 1.0.0)',
                });
              }
              appVersion = versionValue;
            }
          } else if (part.fieldname === 'permissions') {
            const permValue = String(part.value || '').trim();
            if (permValue) {
              try {
                const parsed = JSON.parse(permValue);
                permissions = Array.isArray(parsed) ? parsed : [permValue];
              } catch {
                permissions = permValue.split(',').map(p => p.trim()).filter(Boolean);
              }
            }
          } else if (part.fieldname === 'publishPwa') {
            const raw = String(part.value || '').trim().toLowerCase();
            publishPwa = ['1', 'true', 'yes', 'on'].includes(raw);
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

      // 精简版：只记录核心信息
      logger.info('Code received for analysis', {
        taskId,
        appName,
        codeLength: codeContent.length,
        detectedType: detection.type,
        confidence: detection.confidence,
        hasIcon: !!iconFile,
      });

      // 详细检测线索放到 debug，避免污染正常日志
      logger.debug('Code detection hints', {
        taskId,
        hints: detection.hints,
      });

      let filePath: string;
      let buildType: 'html' | 'zip';
      let pwaSiteId: string | undefined;

      if (detection.type === 'react-component' && detection.confidence >= 50) {
        // Wrap React component into a full project
        logger.info('Wrapping React component into project', { taskId, appName });

        const identity = resolveAppIdentityFromCode(appName, appId, 'ReactApp');
        appName = identity.appName;
        appId = identity.appId;

        const wrapResult = await wrapReactComponent({
          code: codeContent,
          appName,
          outputDir: path.join(os.tmpdir(), `react-wrap-${taskId}`),
        });

        // Create ZIP from the project
        const zipPath = path.join(config.buildsDir, `${taskId}-project.zip`);
        await createProjectZip(wrapResult.projectDir, zipPath);

        // Save the ZIP file reference
        filePath = zipPath;
        buildType = 'zip';

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

      if (publishPwa) {
        if (!config.pwaEnabled) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'PWA publishing is not enabled on this server',
          });
        }
        pwaSiteId = generatePwaSiteId(appName);
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
        appVersion: appVersion || '1.0.0', // Default to 1.0.0 if not provided
        iconPath,
        permissions,
        outputDir: config.buildsDir,
        createdAt: new Date().toISOString(),
        ...(pwaSiteId ? { pwa: { siteId: pwaSiteId } } : {}),
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
        ...(pwaSiteId ? { pwaSiteId } : {}),
      };
    } catch (error) {
      logger.error('Failed to create code build job', error, { taskId, appName });
      const classified = classifyCreateBuildJobError(error, config.maxFileSize);
      return reply.status(classified.statusCode).send({
        error: classified.error,
        message: classified.message,
        taskId,
        traceId: logger.getTraceId(),
        code: classified.code,
        hint: classified.hint,
      });
    }
  });
};
