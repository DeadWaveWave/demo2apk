import fs from 'fs-extra';
import path from 'path';
import { execa, execaCommand } from 'execa';
import { detectAndroidSdk, setupAndroidEnv } from '../utils/android-sdk.js';

export interface ReactBuildOptions {
  zipPath: string;
  appName?: string;
  appId?: string;
  outputDir?: string;
  onProgress?: (message: string, percent?: number) => void;
}

export interface BuildResult {
  success: boolean;
  apkPath?: string;
  error?: string;
  duration?: number;
}

type ProjectType = 'vite' | 'cra' | 'nextjs' | 'unknown';
type PackageManager = 'npm' | 'yarn' | 'pnpm';

/**
 * Detect the project type from package.json and config files
 */
async function detectProjectType(projectDir: string): Promise<{
  type: ProjectType;
  buildDir: string;
}> {
  const hasFile = async (filename: string) =>
    fs.pathExists(path.join(projectDir, filename));

  if (await hasFile('vite.config.js') || await hasFile('vite.config.ts')) {
    return { type: 'vite', buildDir: 'dist' };
  }

  if (await hasFile('next.config.js') || await hasFile('next.config.ts') || await hasFile('next.config.mjs')) {
    return { type: 'nextjs', buildDir: 'out' };
  }

  // Check for CRA
  const pkgPath = path.join(projectDir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath);
    if (pkg.dependencies?.['react-scripts'] || pkg.devDependencies?.['react-scripts']) {
      return { type: 'cra', buildDir: 'build' };
    }
  }

  return { type: 'unknown', buildDir: 'dist' };
}

/**
 * Detect package manager from lock files
 */
async function detectPackageManager(projectDir: string): Promise<PackageManager> {
  const hasFile = async (filename: string) =>
    fs.pathExists(path.join(projectDir, filename));

  if (await hasFile('pnpm-lock.yaml')) {
    try {
      await execaCommand('pnpm --version');
      return 'pnpm';
    } catch {
      // Fall through
    }
  }

  if (await hasFile('yarn.lock')) {
    try {
      await execaCommand('yarn --version');
      return 'yarn';
    } catch {
      // Fall through
    }
  }

  return 'npm';
}

/**
 * Configure Next.js for static export
 */
async function configureNextjsExport(projectDir: string): Promise<void> {
  const configPath = path.join(projectDir, 'next.config.js');

  // Check if already configured
  if (await fs.pathExists(configPath)) {
    const content = await fs.readFile(configPath, 'utf8');
    if (content.includes("output: 'export'") || content.includes('output: "export"')) {
      return;
    }
  }

  // Create or overwrite config for static export
  const config = `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

module.exports = nextConfig;
`;

  await fs.writeFile(configPath, config, 'utf8');
}

/**
 * Build APK from React project ZIP
 */
export async function buildReactToApk(options: ReactBuildOptions): Promise<BuildResult> {
  const startTime = Date.now();
  const {
    zipPath,
    appName = 'MyReactApp',
    appId = 'com.example.reactapp',
    outputDir = path.join(process.cwd(), 'builds'),
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

    // Create work directory
    const workDir = path.join(outputDir, `${appName}-build`);
    await fs.remove(workDir);
    await fs.ensureDir(workDir);

    onProgress?.('Extracting project...', 10);

    // Extract ZIP
    await execa('unzip', ['-q', zipPath, '-d', workDir]);

    // Find project root (directory containing package.json)
    let projectDir = workDir;
    const packageJsonPath = path.join(workDir, 'package.json');

    if (!(await fs.pathExists(packageJsonPath))) {
      // Search for package.json in subdirectories
      const entries = await fs.readdir(workDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPkgPath = path.join(workDir, entry.name, 'package.json');
          if (await fs.pathExists(subPkgPath)) {
            projectDir = path.join(workDir, entry.name);
            break;
          }
        }
      }
    }

    if (!(await fs.pathExists(path.join(projectDir, 'package.json')))) {
      return { success: false, error: 'No package.json found in the ZIP archive' };
    }

    onProgress?.('Analyzing project...', 15);

    // Detect project type and package manager
    const { type: projectType, buildDir } = await detectProjectType(projectDir);
    const packageManager = await detectPackageManager(projectDir);

    onProgress?.(`Detected ${projectType} project, using ${packageManager}`, 18);

    // Configure Next.js if needed
    if (projectType === 'nextjs') {
      onProgress?.('Configuring Next.js for static export...', 20);
      await configureNextjsExport(projectDir);
    }

    onProgress?.('Installing dependencies...', 25);

    // Install dependencies
    await execa(packageManager, ['install'], {
      cwd: projectDir,
    });

    onProgress?.('Building React project...', 40);

    // Build project
    await execa(packageManager, ['run', 'build'], {
      cwd: projectDir,
    });

    // Verify build output
    const buildPath = path.join(projectDir, buildDir);
    if (!(await fs.pathExists(buildPath))) {
      return { success: false, error: `Build output directory not found: ${buildDir}` };
    }

    onProgress?.('Installing Capacitor...', 55);

    // Install Capacitor
    await execa(packageManager, ['install', '@capacitor/core', '@capacitor/cli', '@capacitor/android'], {
      cwd: projectDir,
    });

    onProgress?.('Configuring Capacitor...', 60);

    // Create Capacitor config
    const capacitorConfig = `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${appId}',
  appName: '${appName}',
  webDir: '${buildDir}',
  bundledWebRuntime: false,
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config;
`;

    await fs.writeFile(path.join(projectDir, 'capacitor.config.ts'), capacitorConfig, 'utf8');

    onProgress?.('Adding Android platform...', 65);

    // Add Android platform
    await execa('npx', ['cap', 'add', 'android'], {
      cwd: projectDir,
    });

    onProgress?.('Syncing web resources...', 70);

    // Sync resources
    await execa('npx', ['cap', 'sync', 'android'], {
      cwd: projectDir,
    });

    onProgress?.('Building APK (this may take a few minutes)...', 80);

    // Build APK
    const androidDir = path.join(projectDir, 'android');
    await fs.chmod(path.join(androidDir, 'gradlew'), 0o755);

    await execa('./gradlew', ['assembleDebug', '--no-daemon'], {
      cwd: androidDir,
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

