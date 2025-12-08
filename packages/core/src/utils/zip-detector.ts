/**
 * ZIP Content Type Detection Utility
 * 
 * Automatically detects what type of project is inside a ZIP archive
 * to determine the appropriate build pipeline.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execa } from 'execa';

export type ZipProjectType = 
  | 'react-project'    // Has package.json with React deps, needs npm install && build
  | 'html-project'     // Has index.html + assets, no build needed
  | 'html-single'      // Single HTML file only
  | 'unknown';

export interface ZipDetectionResult {
  type: ZipProjectType;
  confidence: number;       // 0-100
  hints: string[];          // Detected features
  entryPoint: string | null; // Main file path (index.html or package.json)
  projectRoot: string;      // Root directory inside ZIP (may be nested)
  hasPackageJson: boolean;
  hasIndexHtml: boolean;
  hasReactDeps: boolean;
  hasViteConfig: boolean;
  hasBuildScript: boolean;
  fileCount: number;
  htmlFiles: string[];
  jsFiles: string[];
  cssFiles: string[];
}

interface FileEntry {
  path: string;
  isDirectory: boolean;
}

/**
 * List files in a ZIP archive without extracting
 */
async function listZipContents(zipPath: string): Promise<FileEntry[]> {
  try {
    const { stdout } = await execa('unzip', ['-l', zipPath]);
    const lines = stdout.split('\n');
    const entries: FileEntry[] = [];
    
    // Skip header lines and footer
    let inFileList = false;
    for (const line of lines) {
      if (line.includes('--------')) {
        inFileList = !inFileList;
        continue;
      }
      
      if (inFileList && line.trim()) {
        // Format: Length   Date   Time  Name
        const match = line.match(/\s*\d+\s+\d{2}-\d{2}-\d{2,4}\s+\d{2}:\d{2}\s+(.+)/);
        if (match) {
          const filePath = match[1].trim();
          entries.push({
            path: filePath,
            isDirectory: filePath.endsWith('/'),
          });
        }
      }
    }
    
    return entries;
  } catch {
    return [];
  }
}

/**
 * Extract and read a specific file from ZIP
 */
async function readFileFromZip(zipPath: string, filePath: string): Promise<string | null> {
  const tempDir = path.join(os.tmpdir(), `zip-read-${crypto.randomBytes(4).toString('hex')}`);
  
  try {
    await fs.ensureDir(tempDir);
    await execa('unzip', ['-q', '-o', zipPath, filePath, '-d', tempDir]);
    
    const extractedPath = path.join(tempDir, filePath);
    if (await fs.pathExists(extractedPath)) {
      return await fs.readFile(extractedPath, 'utf8');
    }
    return null;
  } catch {
    return null;
  } finally {
    await fs.remove(tempDir).catch(() => {});
  }
}

/**
 * Find the project root inside ZIP (handles nested directories)
 */
function findProjectRoot(entries: FileEntry[]): string {
  // Get all file paths (not directories), excluding macOS metadata
  const files = entries
    .filter(e => !e.isDirectory)
    .map(e => e.path)
    .filter(p => !p.startsWith('__MACOSX/') && !p.includes('/__MACOSX/'));
  
  if (files.length === 0) return '';
  
  // Check if there's a single root directory
  const topLevelDirs = new Set<string>();
  const topLevelFiles: string[] = [];
  
  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    if (parts.length > 1) {
      topLevelDirs.add(parts[0]);
    } else {
      topLevelFiles.push(parts[0]);
    }
  }
  
  // If all files are under a single directory, that's the root
  if (topLevelDirs.size === 1 && topLevelFiles.length === 0) {
    const rootDir = Array.from(topLevelDirs)[0];
    
    // Check if there are deeper nested roots (e.g., project-name/src/)
    // by looking for package.json or index.html
    const hasRootPkg = files.some(f => f === `${rootDir}/package.json`);
    const hasRootHtml = files.some(f => f === `${rootDir}/index.html`);
    
    if (hasRootPkg || hasRootHtml) {
      return rootDir;
    }
    
    // Check one level deeper
    const secondLevelDirs = new Set<string>();
    for (const file of files) {
      const parts = file.split('/').filter(Boolean);
      if (parts.length > 2) {
        secondLevelDirs.add(`${parts[0]}/${parts[1]}`);
      }
    }
    
    if (secondLevelDirs.size === 1) {
      const deepRoot = Array.from(secondLevelDirs)[0];
      const hasDeepPkg = files.some(f => f === `${deepRoot}/package.json`);
      const hasDeepHtml = files.some(f => f === `${deepRoot}/index.html`);
      
      if (hasDeepPkg || hasDeepHtml) {
        return deepRoot;
      }
    }
    
    return rootDir;
  }
  
  // Files are at root level
  return '';
}

/**
 * Detect the type of project inside a ZIP archive
 */
export async function detectZipProjectType(zipPath: string): Promise<ZipDetectionResult> {
  const result: ZipDetectionResult = {
    type: 'unknown',
    confidence: 0,
    hints: [],
    entryPoint: null,
    projectRoot: '',
    hasPackageJson: false,
    hasIndexHtml: false,
    hasReactDeps: false,
    hasViteConfig: false,
    hasBuildScript: false,
    fileCount: 0,
    htmlFiles: [],
    jsFiles: [],
    cssFiles: [],
  };

  // Validate ZIP exists
  if (!(await fs.pathExists(zipPath))) {
    result.hints.push('ZIP file not found');
    return result;
  }

  // List ZIP contents
  const entries = await listZipContents(zipPath);
  if (entries.length === 0) {
    result.hints.push('Failed to read ZIP contents or empty archive');
    return result;
  }

  // Find project root
  result.projectRoot = findProjectRoot(entries);
  const rootPrefix = result.projectRoot ? `${result.projectRoot}/` : '';
  
  // Get file statistics
  const files = entries.filter(e => !e.isDirectory);
  result.fileCount = files.length;
  
  // Categorize files (relative to project root)
  for (const entry of files) {
    const relativePath = entry.path.startsWith(rootPrefix) 
      ? entry.path.slice(rootPrefix.length)
      : entry.path;
    
    // Skip node_modules and hidden files
    if (relativePath.includes('node_modules/') || relativePath.startsWith('.')) {
      continue;
    }
    
    const ext = path.extname(relativePath).toLowerCase();
    
    if (ext === '.html' || ext === '.htm') {
      result.htmlFiles.push(relativePath);
    } else if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      result.jsFiles.push(relativePath);
    } else if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') {
      result.cssFiles.push(relativePath);
    }
  }

  // Check for key files
  const packageJsonPath = `${rootPrefix}package.json`;
  const indexHtmlPath = `${rootPrefix}index.html`;
  const viteConfigJs = `${rootPrefix}vite.config.js`;
  const viteConfigTs = `${rootPrefix}vite.config.ts`;
  
  result.hasPackageJson = files.some(f => f.path === packageJsonPath);
  result.hasIndexHtml = files.some(f => f.path === indexHtmlPath);
  result.hasViteConfig = files.some(f => f.path === viteConfigJs || f.path === viteConfigTs);

  // Read and analyze package.json if present
  if (result.hasPackageJson) {
    const pkgContent = await readFileFromZip(zipPath, packageJsonPath);
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        
        // Check for React dependencies
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        result.hasReactDeps = !!(deps.react || deps['react-dom'] || deps['@vitejs/plugin-react']);
        
        // Check for build script
        result.hasBuildScript = !!(pkg.scripts?.build);
        
        if (result.hasReactDeps) {
          result.hints.push('React dependencies found in package.json');
        }
        if (result.hasBuildScript) {
          result.hints.push('Build script found in package.json');
        }
        if (deps.vite) {
          result.hints.push('Vite dependency found');
        }
      } catch {
        result.hints.push('Failed to parse package.json');
      }
    }
  }

  // Determine project type
  // Priority 1: Has vite.config → definitely a Vite React project
  if (result.hasViteConfig && result.hasPackageJson) {
    result.type = 'react-project';
    result.entryPoint = packageJsonPath;
    result.confidence = 95;
    result.hints.push('Vite config file found - treating as React project');
  }
  // Priority 2: Has package.json with React deps or build script
  else if (result.hasPackageJson && (result.hasReactDeps || result.hasBuildScript)) {
    result.type = 'react-project';
    result.entryPoint = packageJsonPath;
    result.confidence = 90;
    
    if (result.hasReactDeps) {
      result.hints.push('React dependencies detected');
    }
    if (result.hasBuildScript) {
      result.hints.push('Build script detected');
    }
  } 
  // Priority 3: Static HTML project
  else if (result.hasIndexHtml) {
    // Has index.html but no package.json (or no build deps)
    if (result.fileCount === 1 || (result.htmlFiles.length === 1 && result.jsFiles.length === 0 && result.cssFiles.length === 0)) {
      // Single HTML file
      result.type = 'html-single';
      result.confidence = 90;
      result.hints.push('Single HTML file detected');
    } else {
      // Multi-file HTML project
      result.type = 'html-project';
      result.confidence = 85;
      result.hints.push('Multi-file HTML project detected');
      
      if (result.jsFiles.length > 0) {
        result.hints.push(`${result.jsFiles.length} JavaScript files found`);
      }
      if (result.cssFiles.length > 0) {
        result.hints.push(`${result.cssFiles.length} CSS files found`);
      }
    }
    result.entryPoint = indexHtmlPath;
  } else if (result.htmlFiles.length > 0) {
    // Has HTML files but no index.html
    result.type = 'html-project';
    result.confidence = 70;
    result.hints.push(`No index.html, but found ${result.htmlFiles.length} HTML file(s)`);
    result.entryPoint = `${rootPrefix}${result.htmlFiles[0]}`;
  } else {
    result.type = 'unknown';
    result.confidence = 0;
    result.hints.push('Could not determine project type');
  }

  return result;
}

/**
 * Get a human-readable label for the project type
 */
export function getZipProjectTypeLabel(type: ZipProjectType): string {
  switch (type) {
    case 'react-project':
      return 'React/Vite Project';
    case 'html-project':
      return 'HTML + Assets';
    case 'html-single':
      return 'Single HTML';
    case 'unknown':
      return 'Unknown';
  }
}

/**
 * Get the recommended build approach for a project type
 */
export function getRecommendedBuildApproach(type: ZipProjectType): string {
  switch (type) {
    case 'react-project':
      return 'npm install → npm build → Capacitor';
    case 'html-project':
      return 'Direct → Cordova';
    case 'html-single':
      return 'Direct → Cordova';
    case 'unknown':
      return 'Manual inspection required';
  }
}

