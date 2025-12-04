import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execa, execaCommand } from 'execa';
import sharp from 'sharp';
import { detectAndroidSdk, setupAndroidEnv, detectCordova } from '../utils/android-sdk.js';
import { needsOfflineify, offlineifyHtml } from '../utils/offlineify.js';

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
  onProgress?: (message: string) => void
): Promise<void> {
  // Determine which icon to use
  let iconPath: string;

  if (customIconPath && await fs.pathExists(customIconPath)) {
    iconPath = customIconPath;
    onProgress?.('Injecting custom app icon...');
  } else {
    iconPath = getDefaultIconPath();
    if (!(await fs.pathExists(iconPath))) {
      onProgress?.('No icon found, skipping icon injection');
      return;
    }
    onProgress?.('Injecting default app icon...');
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
 */
export function generateAppId(appName: string): string {
  // Sanitize: lowercase, replace non-alphanumeric with dots
  let sanitized = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  if (!sanitized) {
    sanitized = 'app';
  }

  // Ensure each segment starts with a letter
  const parts = sanitized.split('.');
  const fixedParts = parts.map((part, idx) => {
    if (!part) {
      return `app${idx}`;
    }
    if (!/^[a-z]/.test(part)) {
      return `a${part}`;
    }
    return part;
  });

  return `com.vibecoding.${fixedParts.join('.')}`;
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
  onProgress?: (message: string) => void
): Promise<void> {
  const gradlewPath = path.join(androidDir, 'gradlew');

  if (await fs.pathExists(gradlewPath)) {
    onProgress?.('Gradle wrapper already exists');
    return;
  }

  onProgress?.('Setting up Gradle wrapper...');

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
    await injectIcon(workDir, iconPath, onProgress);

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
    await ensureGradleWrapper(androidDir, onProgress);

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

    const apkDest = path.join(outputDir, `${appName}.apk`);
    await fs.copy(apkSource, apkDest);

    // Cleanup temp directory
    if (tempOfflineDir) {
      await fs.remove(tempOfflineDir);
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

