import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execa, execaCommand } from 'execa';
import sharp from 'sharp';
import { pinyin } from 'pinyin-pro';
import { detectAndroidSdk, setupAndroidEnv, detectCordova } from '../utils/android-sdk.js';
import { needsOfflineify, offlineifyHtml } from '../utils/offlineify.js';
import { shouldCleanupBuildArtifacts } from '../utils/build-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the default icon asset
 */
function getDefaultIconPath(): string {
  // In dist: dist/builders/html-builder.js -> assets/default-icon.png
  // In src: src/builders/html-builder.ts -> assets/default-icon.png
  return path.resolve(__dirname, '../../assets/default-icon.png');
}

export interface HtmlBuildOptions {
  htmlPath: string;
  appName?: string;
  appId?: string;
  outputDir?: string;
  skipOfflineify?: boolean;
  iconPath?: string;  // Custom icon path (optional)
  taskId?: string;    // Task ID for unique file naming
  onProgress?: (message: string, percent?: number) => void;
}

export interface HtmlProjectBuildOptions {
  zipPath: string;
  projectRoot?: string;  // Root directory inside ZIP (if nested)
  appName?: string;
  appId?: string;
  outputDir?: string;
  iconPath?: string;
  taskId?: string;
  onProgress?: (message: string, percent?: number) => void;
}

export interface BuildResult {
  success: boolean;
  apkPath?: string;
  error?: string;
  duration?: number;
}

const GRADLE_VERSION = '8.9';
const GRADLE_DIST_URL = `https://mirrors.cloud.tencent.com/gradle/gradle-${GRADLE_VERSION}-bin.zip`;

/**
 * Android icon sizes for different DPI densities
 */
const ANDROID_ICON_SIZES: Record<string, number> = {
  'ldpi': 36,
  'mdpi': 48,
  'hdpi': 72,
  'xhdpi': 96,
  'xxhdpi': 144,
  'xxxhdpi': 192,
};

/**
 * Resize icon to specified size using sharp
 */
async function resizeIcon(inputPath: string, outputPath: string, size: number): Promise<void> {
  await sharp(inputPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

/**
 * Inject icon into Cordova project
 * Uses custom icon if provided, otherwise falls back to default icon
 */
async function injectIcon(
  workDir: string,
  customIconPath?: string,
  onProgress?: (message: string, percent?: number) => void,
  progressPercent?: number
): Promise<void> {
  // Determine which icon to use
  let iconPath: string;

  if (customIconPath && await fs.pathExists(customIconPath)) {
    iconPath = customIconPath;
    onProgress?.('Injecting custom app icon...', progressPercent);
  } else {
    iconPath = getDefaultIconPath();
    if (!(await fs.pathExists(iconPath))) {
      onProgress?.('No icon found, skipping icon injection', progressPercent);
      return;
    }
    onProgress?.('Injecting default app icon...', progressPercent);
  }

  // Create res directory for icons
  const resDir = path.join(workDir, 'res');
  await fs.ensureDir(resDir);

  // Create icon directory
  const iconDir = path.join(resDir, 'icon/android');
  await fs.ensureDir(iconDir);

  // Resize and copy icon for each density
  for (const [density, size] of Object.entries(ANDROID_ICON_SIZES)) {
    const outputPath = path.join(iconDir, `icon-${density}.png`);
    await resizeIcon(iconPath, outputPath, size);
  }

  // Also create the main icon (use xxxhdpi size = 192)
  await resizeIcon(iconPath, path.join(resDir, 'icon.png'), 192);

  // Update config.xml to include icon configuration
  const configXmlPath = path.join(workDir, 'config.xml');
  if (await fs.pathExists(configXmlPath)) {
    let configContent = await fs.readFile(configXmlPath, 'utf8');

    // Check if icon is already configured
    if (!configContent.includes('<icon')) {
      // Build icon configuration for Android
      const iconConfigs = Object.entries(ANDROID_ICON_SIZES)
        .map(([density, size]) =>
          `    <icon density="${density}" src="res/icon/android/icon-${density}.png" width="${size}" height="${size}" />`
        )
        .join('\n');

      const iconXml = `
    <!-- App Icon -->
    <icon src="res/icon.png" />
    <platform name="android">
${iconConfigs}
    </platform>`;

      // Insert icon config before closing </widget> tag
      configContent = configContent.replace('</widget>', `${iconXml}\n</widget>`);
      await fs.writeFile(configXmlPath, configContent);
    }
  }
}

/**
 * Sanitize a string to be safe for use as a directory name.
 * Replaces non-ASCII characters, spaces, and special characters with underscores.
 * This prevents issues with Java/Gradle on systems with POSIX locale.
 */
function sanitizeDirName(name: string): string {
  return name
    .replace(/[^\w.-]/g, '_')  // Replace non-word chars (except . and -) with underscore
    .replace(/_+/g, '_')        // Collapse multiple underscores
    .replace(/^_|_$/g, '')      // Trim leading/trailing underscores
    || 'project';               // Fallback if result is empty
}

/**
 * Generate a valid Android package ID from app name
 * - Convert non-ASCII to pinyin
 * - Remove all separators inside the suffix (no dots), only keep [a-z0-9]
 * - Ensure starts with letter and apply max length
 * - Prefix is always com.demo2apk.*
 */
export function generateAppId(appName: string): string {
  const MAX_SUFFIX_LENGTH = 30;

  // Step 1: convert non-ASCII (e.g., Chinese) to pinyin to keep uniqueness across languages
  let latinName = appName;
  try {
    const py = pinyin(appName, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
    latinName = Array.isArray(py) ? py.join('') : String(py);
  } catch {
    // Fallback to original name if pinyin conversion fails
    latinName = appName;
  }

  // Step 2: sanitize to Android-safe suffix (no dots inside the suffix)
  let sanitized = latinName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  if (!sanitized) {
    sanitized = 'app';
  }

  // Ensure starts with a letter
  if (!/^[a-z]/.test(sanitized)) {
    sanitized = `a${sanitized}`;
  }

  // Apply max length to avoid overly long package names
  sanitized = sanitized.slice(0, MAX_SUFFIX_LENGTH);

  return `com.demo2apk.${sanitized}`;
}

/**
 * Add required meta tags to HTML content for Cordova
 */
export function prepareHtmlForCordova(htmlContent: string): string {
  let html = htmlContent;

  // Add viewport meta if not present
  if (!html.includes('viewport')) {
    html = html.replace(
      /<head([^>]*)>/i,
      '<head$1>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
    );
  }

  // Add CSP meta if not present
  if (!html.includes('Content-Security-Policy')) {
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n    <meta http-equiv="Content-Security-Policy" content="default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: gap: content:">`
    );
  }

  // Add cordova.js reference if not present
  if (!html.includes('cordova.js')) {
    html = html.replace('</body>', '    <script src="cordova.js"></script>\n</body>');
  }

  return html;
}

/**
 * Download and setup Gradle wrapper
 * Note: Gradle is cached in ~/.gradle/wrapper/dists (standard Gradle cache location)
 * This ensures Docker volume mounting gradle-cache:/root/.gradle works correctly
 */
async function ensureGradleWrapper(
  androidDir: string,
  onProgress?: (message: string, percent?: number) => void,
  progressPercent?: number
): Promise<void> {
  const gradlewPath = path.join(androidDir, 'gradlew');

  if (await fs.pathExists(gradlewPath)) {
    onProgress?.('Gradle wrapper already exists', progressPercent);
    return;
  }

  onProgress?.('Setting up Gradle wrapper...', progressPercent);

  // Check if gradle is available globally
  try {
    await execaCommand('gradle --version');
    await execa('gradle', ['wrapper', '--gradle-version', GRADLE_VERSION, '--gradle-distribution-url', GRADLE_DIST_URL], {
      cwd: androidDir,
    });
  } catch {
    // Download Gradle if not available
    // Use ~/.gradle/gradle-dist to match Docker volume mount (gradle-cache:/root/.gradle)
    const gradleDir = path.join(os.homedir(), '.gradle', 'gradle-dist', `gradle-${GRADLE_VERSION}`);
    const gradleBin = path.join(gradleDir, 'bin', 'gradle');

    if (!(await fs.pathExists(gradleBin))) {
      onProgress?.(`Downloading Gradle ${GRADLE_VERSION}...`);
      const tmpZip = path.join(os.tmpdir(), `gradle-${GRADLE_VERSION}.zip`);

      await execa('curl', ['-L', GRADLE_DIST_URL, '-o', tmpZip]);
      await fs.ensureDir(path.dirname(gradleDir));
      await execa('unzip', ['-q', tmpZip, '-d', path.dirname(gradleDir)]);
      await fs.remove(tmpZip);
    }

    await execa(gradleBin, ['wrapper', '--gradle-version', GRADLE_VERSION, '--gradle-distribution-url', GRADLE_DIST_URL], {
      cwd: androidDir,
    });
  }

  // Ensure gradlew is executable
  await fs.chmod(gradlewPath, 0o755);
}

/**
 * Build APK from HTML file using Cordova
 */
export async function buildHtmlToApk(options: HtmlBuildOptions): Promise<BuildResult> {
  const startTime = Date.now();
  const {
    htmlPath,
    appName = 'MyVibeApp',
    appId = generateAppId(appName),
    outputDir = path.join(process.cwd(), 'builds'),
    skipOfflineify = false,
    iconPath,
    onProgress,
  } = options;

  try {
    // Validate HTML file exists
    if (!(await fs.pathExists(htmlPath))) {
      return { success: false, error: `HTML file not found: ${htmlPath}` };
    }

    onProgress?.('Checking build environment...', 5);

    // Check Android SDK
    const sdkInfo = await detectAndroidSdk();
    if (!sdkInfo.isValid) {
      return { success: false, error: 'Android SDK not found. Please set ANDROID_HOME.' };
    }
    setupAndroidEnv(sdkInfo.androidHome);

    // Check Cordova
    const cordovaInfo = await detectCordova();
    if (!cordovaInfo.isInstalled) {
      onProgress?.('Installing Cordova CLI...', 10);
      await execaCommand('npm install -g cordova');
    }

    // Prepare HTML (offlineify if needed)
    let processedHtmlPath = htmlPath;
    let tempOfflineDir: string | undefined;

    const htmlContent = await fs.readFile(htmlPath, 'utf8');

    if (!skipOfflineify && needsOfflineify(htmlContent)) {
      onProgress?.('Offlineifying HTML resources...', 15);
      const result = await offlineifyHtml({ inputPath: htmlPath });
      processedHtmlPath = result.indexPath;
      tempOfflineDir = result.outputDir;
    }

    // Create work directory with ASCII-safe name to avoid Java/Gradle path encoding issues
    const safeAppName = sanitizeDirName(appName);
    const workDir = path.join(outputDir, safeAppName);
    await fs.remove(workDir);
    await fs.ensureDir(workDir);

    onProgress?.('Creating Cordova project...', 25);

    // Create Cordova project
    await execa('cordova', ['create', '.', appId, appName, '--no-telemetry'], {
      cwd: workDir,
    });

    onProgress?.('Installing cordova-android...', 32);

    // Pre-install cordova-android using pnpm (npm has issues with cordova projects)
    // Use --ignore-workspace to avoid conflicts with root workspace
    await execa('pnpm', ['add', 'cordova-android@14', '-D', '--ignore-workspace'], {
      cwd: workDir,
      timeout: 120000, // 2 minute timeout
    });

    onProgress?.('Adding Android platform...', 38);

    // Add Android platform
    await execa('cordova', ['platform', 'add', 'android', '--no-telemetry'], {
      cwd: workDir,
      timeout: 60000,
    });

    // Inject app icon (custom or default)
    onProgress?.('Injecting app icon...', 42);
    await injectIcon(workDir, iconPath, onProgress, 42);

    onProgress?.('Preparing web resources...', 45);

    // Clear www directory and copy HTML resources
    const wwwDir = path.join(workDir, 'www');
    await fs.emptyDir(wwwDir);

    // Copy all files from HTML directory
    const htmlDir = path.dirname(tempOfflineDir ? path.join(tempOfflineDir, 'index.html') : processedHtmlPath);
    await fs.copy(htmlDir, wwwDir);

    // Rename to index.html if needed
    const htmlBasename = path.basename(processedHtmlPath);
    if (htmlBasename !== 'index.html') {
      const srcPath = path.join(wwwDir, htmlBasename);
      const destPath = path.join(wwwDir, 'index.html');
      if (await fs.pathExists(srcPath)) {
        await fs.move(srcPath, destPath, { overwrite: true });
      }
    }

    // Process HTML for Cordova
    const indexPath = path.join(wwwDir, 'index.html');
    let finalHtml = await fs.readFile(indexPath, 'utf8');
    finalHtml = prepareHtmlForCordova(finalHtml);
    await fs.writeFile(indexPath, finalHtml);

    onProgress?.('Syncing resources to Android platform...', 55);

    // Prepare Android platform
    await execa('cordova', ['prepare', 'android', '--no-telemetry'], {
      cwd: workDir,
    });

    onProgress?.('Setting up Gradle...', 60);

    // Setup Gradle wrapper
    const androidDir = path.join(workDir, 'platforms', 'android');
    await ensureGradleWrapper(androidDir, onProgress, 60);

    onProgress?.('Building APK (this may take a few minutes)...', 70);

    // Build APK with memory-optimized settings
    // Limit Gradle JVM heap to 1GB to prevent OOM in containers with 2GB limit
    // Using --no-daemon is already set, but we also limit memory for the forked process
    await execa('./gradlew', ['assembleDebug', '--no-daemon'], {
      cwd: androidDir,
      env: {
        ...process.env,
        // Limit Gradle daemon/forked process memory to prevent OOM
        GRADLE_OPTS: '-Xmx1024m -Dorg.gradle.jvmargs="-Xmx1024m -XX:+HeapDumpOnOutOfMemoryError"',
      },
    });

    onProgress?.('Exporting APK...', 95);

    // Copy APK to output
    const apkSource = path.join(
      androidDir,
      'app',
      'build',
      'outputs',
      'apk',
      'debug',
      'app-debug.apk'
    );

    if (!(await fs.pathExists(apkSource))) {
      return { success: false, error: 'APK build failed - output file not found' };
    }

    // Use taskId in filename to prevent concurrent build conflicts
    const apkFileName = options.taskId ? `${appName}--${options.taskId}.apk` : `${appName}.apk`;
    const apkDest = path.join(outputDir, apkFileName);
    await fs.copy(apkSource, apkDest);

    // Cleanup temp directory
    if (tempOfflineDir) {
      await fs.remove(tempOfflineDir);
    }

    // Optionally cleanup Cordova work directory (build artifacts)
    if (shouldCleanupBuildArtifacts()) {
      try {
        await fs.remove(workDir);
      } catch {
        // Non-fatal – ignore cleanup errors
      }
    }

    const duration = Date.now() - startTime;

    onProgress?.('Build completed!', 100);

    return {
      success: true,
      apkPath: apkDest,
      duration,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Build APK from multi-file HTML project ZIP (HTML + JS + CSS)
 * Uses Cordova, no npm build step needed
 */
export async function buildHtmlProjectToApk(options: HtmlProjectBuildOptions): Promise<BuildResult> {
  const startTime = Date.now();
  const {
    zipPath,
    projectRoot = '',
    appName = 'MyVibeApp',
    appId = generateAppId(appName),
    outputDir = path.join(process.cwd(), 'builds'),
    iconPath,
    taskId,
    onProgress,
  } = options;

  try {
    // Validate ZIP file exists
    if (!(await fs.pathExists(zipPath))) {
      return { success: false, error: `ZIP file not found: ${zipPath}` };
    }

    onProgress?.('Checking build environment...', 5);

    // Check Android SDK
    const sdkInfo = await detectAndroidSdk();
    if (!sdkInfo.isValid) {
      return { success: false, error: 'Android SDK not found. Please set ANDROID_HOME.' };
    }
    setupAndroidEnv(sdkInfo.androidHome);

    // Check Cordova
    const cordovaInfo = await detectCordova();
    if (!cordovaInfo.isInstalled) {
      onProgress?.('Installing Cordova CLI...', 10);
      await execaCommand('npm install -g cordova');
    }

    // Create work directory
    const safeAppName = sanitizeDirName(appName);
    const workDir = path.join(outputDir, `${safeAppName}-html-build`);
    await fs.remove(workDir);
    await fs.ensureDir(workDir);

    onProgress?.('Extracting project files...', 15);

    // Extract ZIP to temp location
    const extractDir = path.join(workDir, 'extracted');
    await fs.ensureDir(extractDir);
    await execa('unzip', ['-q', zipPath, '-d', extractDir]);

    // Find the actual project root
    let projectDir = extractDir;
    if (projectRoot) {
      projectDir = path.join(extractDir, projectRoot);
    } else {
      // Auto-detect: look for index.html
      const entries = await fs.readdir(extractDir, { withFileTypes: true });
      
      // Check if index.html is at root
      if (await fs.pathExists(path.join(extractDir, 'index.html'))) {
        projectDir = extractDir;
      } else {
        // Check subdirectories
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = path.join(extractDir, entry.name, 'index.html');
            if (await fs.pathExists(subPath)) {
              projectDir = path.join(extractDir, entry.name);
              break;
            }
          }
        }
      }
    }

    // Verify index.html exists
    const indexHtmlPath = path.join(projectDir, 'index.html');
    if (!(await fs.pathExists(indexHtmlPath))) {
      // Try to find any HTML file
      const htmlFiles = await findHtmlFiles(projectDir);
      if (htmlFiles.length === 0) {
        return { success: false, error: 'No index.html or HTML files found in the project' };
      }
      // Use the first HTML file and rename it
      const firstHtml = htmlFiles[0];
      await fs.move(firstHtml, indexHtmlPath);
      onProgress?.(`Using ${path.basename(firstHtml)} as entry point`, 18);
    }

    onProgress?.('Creating Cordova project...', 25);

    // Create Cordova project in a separate directory
    const cordovaDir = path.join(workDir, 'cordova');
    await fs.ensureDir(cordovaDir);

    await execa('cordova', ['create', '.', appId, appName, '--no-telemetry'], {
      cwd: cordovaDir,
    });

    onProgress?.('Installing cordova-android...', 32);

    await execa('pnpm', ['add', 'cordova-android@14', '-D', '--ignore-workspace'], {
      cwd: cordovaDir,
      timeout: 120000,
    });

    onProgress?.('Adding Android platform...', 38);

    await execa('cordova', ['platform', 'add', 'android', '--no-telemetry'], {
      cwd: cordovaDir,
      timeout: 60000,
    });

    // Inject app icon
    onProgress?.('Injecting app icon...', 42);
    await injectIcon(cordovaDir, iconPath, onProgress, 42);

    onProgress?.('Copying web resources...', 50);

    // Clear www and copy all project files
    const wwwDir = path.join(cordovaDir, 'www');
    await fs.emptyDir(wwwDir);
    
    // Copy all files from project directory
    await fs.copy(projectDir, wwwDir, {
      filter: (src) => {
        // Skip node_modules and hidden files
        const relativePath = path.relative(projectDir, src);
        return !relativePath.includes('node_modules') && 
               !path.basename(src).startsWith('.') &&
               !relativePath.includes('__MACOSX');
      },
    });

    // Process index.html for Cordova
    let indexHtml = await fs.readFile(path.join(wwwDir, 'index.html'), 'utf8');
    indexHtml = prepareHtmlForCordova(indexHtml);
    await fs.writeFile(path.join(wwwDir, 'index.html'), indexHtml);

    onProgress?.('Syncing resources to Android platform...', 60);

    await execa('cordova', ['prepare', 'android', '--no-telemetry'], {
      cwd: cordovaDir,
    });

    onProgress?.('Setting up Gradle...', 65);

    const androidDir = path.join(cordovaDir, 'platforms', 'android');
    await ensureGradleWrapper(androidDir, onProgress, 65);

    onProgress?.('Building APK (this may take a few minutes)...', 75);

    await execa('./gradlew', ['assembleDebug', '--no-daemon'], {
      cwd: androidDir,
      env: {
        ...process.env,
        GRADLE_OPTS: '-Xmx1024m -Dorg.gradle.jvmargs="-Xmx1024m -XX:+HeapDumpOnOutOfMemoryError"',
      },
    });

    onProgress?.('Exporting APK...', 95);

    const apkSource = path.join(
      androidDir,
      'app',
      'build',
      'outputs',
      'apk',
      'debug',
      'app-debug.apk'
    );

    if (!(await fs.pathExists(apkSource))) {
      return { success: false, error: 'APK build failed - output file not found' };
    }

    const apkFileName = taskId ? `${appName}--${taskId}.apk` : `${appName}.apk`;
    const apkDest = path.join(outputDir, apkFileName);
    await fs.copy(apkSource, apkDest);

    // Verify copy
    const destStats = await fs.stat(apkDest);
    const sourceStats = await fs.stat(apkSource);
    if (destStats.size !== sourceStats.size) {
      return { success: false, error: 'APK copy verification failed' };
    }

    // Optionally cleanup Cordova work directory (build artifacts)
    if (shouldCleanupBuildArtifacts()) {
      try {
        await fs.remove(workDir);
      } catch {
        // Non-fatal – ignore cleanup errors
      }
    }

    const duration = Date.now() - startTime;

    onProgress?.('Build completed!', 100);

    return {
      success: true,
      apkPath: apkDest,
      duration,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Recursively find HTML files in a directory
 */
async function findHtmlFiles(dir: string): Promise<string[]> {
  const htmlFiles: string[] = [];
  
  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.html' || ext === '.htm') {
          htmlFiles.push(fullPath);
        }
      }
    }
  }
  
  await scan(dir);
  return htmlFiles;
}

