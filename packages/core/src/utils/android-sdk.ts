import { existsSync } from 'fs';
import { execaCommand } from 'execa';
import path from 'path';
import os from 'os';

export interface AndroidSdkInfo {
  androidHome: string;
  isValid: boolean;
  platformToolsPath?: string;
  buildToolsPath?: string;
  javaVersion?: string;
}

const POSSIBLE_SDK_PATHS = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(os.homedir(), 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  '/opt/android-sdk',
  '/usr/local/android-sdk',
];

/**
 * Detect and validate Android SDK installation
 */
export async function detectAndroidSdk(): Promise<AndroidSdkInfo> {
  let androidHome: string | undefined;

  // Find a valid SDK path
  for (const sdkPath of POSSIBLE_SDK_PATHS) {
    if (sdkPath && existsSync(sdkPath)) {
      androidHome = sdkPath;
      break;
    }
  }

  if (!androidHome) {
    return {
      androidHome: '',
      isValid: false,
    };
  }

  const platformToolsPath = path.join(androidHome, 'platform-tools');
  const buildToolsDir = path.join(androidHome, 'build-tools');

  // Find latest build-tools version
  let buildToolsPath: string | undefined;
  if (existsSync(buildToolsDir)) {
    const { readdir } = await import('fs/promises');
    const versions = await readdir(buildToolsDir);
    if (versions.length > 0) {
      const latestVersion = versions.sort().reverse()[0];
      buildToolsPath = path.join(buildToolsDir, latestVersion);
    }
  }

  return {
    androidHome,
    isValid: existsSync(platformToolsPath),
    platformToolsPath: existsSync(platformToolsPath) ? platformToolsPath : undefined,
    buildToolsPath,
  };
}

/**
 * Detect Java installation
 */
export async function detectJava(): Promise<{ version: string; isValid: boolean }> {
  try {
    const { stdout } = await execaCommand('java -version', { stderr: 'pipe' });
    // Java outputs version to stderr, but execa might capture it differently
    const version = stdout || '';
    return {
      version: version.split('\n')[0] || 'unknown',
      isValid: true,
    };
  } catch (error) {
    try {
      // Try capturing stderr as well
      const { stderr } = await execaCommand('java -version');
      if (stderr) {
        return {
          version: stderr.split('\n')[0] || 'unknown',
          isValid: true,
        };
      }
    } catch {
      // Ignore
    }
    return {
      version: '',
      isValid: false,
    };
  }
}

/**
 * Check if Cordova is installed globally
 */
export async function detectCordova(): Promise<{ version: string; isInstalled: boolean }> {
  try {
    const { stdout } = await execaCommand('cordova --version');
    return {
      version: stdout.trim(),
      isInstalled: true,
    };
  } catch {
    return {
      version: '',
      isInstalled: false,
    };
  }
}

/**
 * Check all required dependencies for building APKs
 */
export async function checkBuildEnvironment(): Promise<{
  isReady: boolean;
  androidSdk: AndroidSdkInfo;
  java: { version: string; isValid: boolean };
  cordova: { version: string; isInstalled: boolean };
  node: { version: string };
  errors: string[];
}> {
  const [androidSdk, java, cordova] = await Promise.all([
    detectAndroidSdk(),
    detectJava(),
    detectCordova(),
  ]);

  const errors: string[] = [];

  if (!androidSdk.isValid) {
    errors.push('Android SDK not found. Please install Android SDK and set ANDROID_HOME.');
  }

  if (!java.isValid) {
    errors.push('Java JDK not found. Please install JDK 11, 17, or 21.');
  }

  if (!cordova.isInstalled) {
    errors.push('Cordova CLI not installed. Run: npm install -g cordova');
  }

  return {
    isReady: errors.length === 0,
    androidSdk,
    java,
    cordova,
    node: { version: process.version },
    errors,
  };
}

/**
 * Set up environment variables for Android build
 */
export function setupAndroidEnv(androidHome: string): void {
  process.env.ANDROID_HOME = androidHome;
  process.env.ANDROID_SDK_ROOT = androidHome;
  
  const platformTools = path.join(androidHome, 'platform-tools');
  const cmdlineTools = path.join(androidHome, 'cmdline-tools', 'latest', 'bin');
  
  const currentPath = process.env.PATH || '';
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  
  if (!currentPath.includes(platformTools)) {
    process.env.PATH = `${platformTools}${pathSeparator}${cmdlineTools}${pathSeparator}${currentPath}`;
  }
}

