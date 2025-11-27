import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface StorageConfig {
  buildsDir: string;
  uploadsDir: string;
  maxAge: number; // Max age in milliseconds before cleanup
}

const defaultConfig: StorageConfig = {
  buildsDir: process.env.BUILDS_DIR || path.join(process.cwd(), 'builds'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(os.tmpdir(), 'demo2apk-uploads'),
  maxAge: parseInt(process.env.STORAGE_MAX_AGE || String(24 * 60 * 60 * 1000), 10), // 24 hours
};

/**
 * Initialize storage directories
 */
export async function initStorage(config: Partial<StorageConfig> = {}): Promise<StorageConfig> {
  const finalConfig = { ...defaultConfig, ...config };

  await fs.ensureDir(finalConfig.buildsDir);
  await fs.ensureDir(finalConfig.uploadsDir);

  return finalConfig;
}

/**
 * Save uploaded file to storage
 */
export async function saveUploadedFile(
  fileBuffer: Buffer,
  filename: string,
  taskId: string,
  config: Partial<StorageConfig> = {}
): Promise<string> {
  const finalConfig = { ...defaultConfig, ...config };

  const taskDir = path.join(finalConfig.uploadsDir, taskId);
  await fs.ensureDir(taskDir);

  const filePath = path.join(taskDir, filename);
  await fs.writeFile(filePath, fileBuffer);

  return filePath;
}

/**
 * Get APK file path for a task
 */
export function getApkPath(taskId: string, appName: string, config: Partial<StorageConfig> = {}): string {
  const finalConfig = { ...defaultConfig, ...config };
  return path.join(finalConfig.buildsDir, `${appName}.apk`);
}

/**
 * Check if APK exists
 */
export async function apkExists(apkPath: string): Promise<boolean> {
  return fs.pathExists(apkPath);
}

/**
 * Get APK file size
 */
export async function getApkSize(apkPath: string): Promise<number> {
  const stat = await fs.stat(apkPath);
  return stat.size;
}

/**
 * Clean up task files (uploads and build artifacts)
 */
export async function cleanupTask(
  taskId: string,
  appName: string,
  config: Partial<StorageConfig> = {}
): Promise<void> {
  const finalConfig = { ...defaultConfig, ...config };

  // Remove upload directory
  const uploadDir = path.join(finalConfig.uploadsDir, taskId);
  if (await fs.pathExists(uploadDir)) {
    await fs.remove(uploadDir);
  }

  // Remove build directory
  const buildDir = path.join(finalConfig.buildsDir, appName);
  if (await fs.pathExists(buildDir)) {
    await fs.remove(buildDir);
  }
}

/**
 * Clean up old files based on maxAge
 */
export async function cleanupOldFiles(config: Partial<StorageConfig> = {}): Promise<{
  deletedUploads: number;
  deletedBuilds: number;
}> {
  const finalConfig = { ...defaultConfig, ...config };
  const now = Date.now();

  let deletedUploads = 0;
  let deletedBuilds = 0;

  // Clean uploads
  if (await fs.pathExists(finalConfig.uploadsDir)) {
    const uploads = await fs.readdir(finalConfig.uploadsDir);

    for (const upload of uploads) {
      const uploadPath = path.join(finalConfig.uploadsDir, upload);
      const stat = await fs.stat(uploadPath);

      if (now - stat.mtimeMs > finalConfig.maxAge) {
        await fs.remove(uploadPath);
        deletedUploads++;
      }
    }
  }

  // Clean APK files older than maxAge
  if (await fs.pathExists(finalConfig.buildsDir)) {
    const builds = await fs.readdir(finalConfig.buildsDir);

    for (const build of builds) {
      const buildPath = path.join(finalConfig.buildsDir, build);
      const stat = await fs.stat(buildPath);

      if (now - stat.mtimeMs > finalConfig.maxAge) {
        await fs.remove(buildPath);
        deletedBuilds++;
      }
    }
  }

  return { deletedUploads, deletedBuilds };
}

/**
 * Get storage statistics
 */
export async function getStorageStats(config: Partial<StorageConfig> = {}): Promise<{
  uploadsCount: number;
  uploadsSize: number;
  buildsCount: number;
  buildsSize: number;
}> {
  const finalConfig = { ...defaultConfig, ...config };

  let uploadsCount = 0;
  let uploadsSize = 0;
  let buildsCount = 0;
  let buildsSize = 0;

  if (await fs.pathExists(finalConfig.uploadsDir)) {
    const uploads = await fs.readdir(finalConfig.uploadsDir);
    uploadsCount = uploads.length;

    for (const upload of uploads) {
      const stat = await fs.stat(path.join(finalConfig.uploadsDir, upload));
      uploadsSize += stat.size;
    }
  }

  if (await fs.pathExists(finalConfig.buildsDir)) {
    const builds = await fs.readdir(finalConfig.buildsDir);

    for (const build of builds) {
      const buildPath = path.join(finalConfig.buildsDir, build);
      const stat = await fs.stat(buildPath);

      if (stat.isFile() && build.endsWith('.apk')) {
        buildsCount++;
        buildsSize += stat.size;
      }
    }
  }

  return { uploadsCount, uploadsSize, buildsCount, buildsSize };
}

