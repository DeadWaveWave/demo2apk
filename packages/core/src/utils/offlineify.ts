import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { execa } from 'execa';
import * as babel from '@babel/core';

// Use createRequire to resolve paths from this package's location,
// not the caller's location (e.g., backend package)
const require = createRequire(import.meta.url);

// Resolve tailwindcss CLI path from this package
function getTailwindCliPath(): string {
  // tailwindcss package exports its CLI at lib/cli.js
  const tailwindPkg = require.resolve('tailwindcss/package.json');
  return path.join(path.dirname(tailwindPkg), 'lib', 'cli.js');
}

export interface OfflineifyOptions {
  inputPath: string;
  outputDir?: string;
}

export interface OfflineifyResult {
  outputDir: string;
  indexPath: string;
  appJsPath?: string;
  vendorFiles: string[];
}

const CDN_PATTERNS = [
  /cdn\.tailwindcss\.com/i,
  /unpkg\.com/i,
  /fonts\.googleapis\.com/i,
  /@babel\/standalone/i,
  /canvas-confetti/i,
  /cdnjs\.cloudflare\.com/i,
];

const BABEL_SCRIPT_PATTERN = /text\/babel/i;

/**
 * Check if HTML content contains external CDN dependencies or JSX
 */
export function needsOfflineify(htmlContent: string): boolean {
  // Check for CDN URLs
  for (const pattern of CDN_PATTERNS) {
    if (pattern.test(htmlContent)) {
      return true;
    }
  }

  // Check for text/babel scripts
  if (BABEL_SCRIPT_PATTERN.test(htmlContent)) {
    return true;
  }

  return false;
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  if (await fs.pathExists(destPath)) {
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

/**
 * Convert HTML with CDN dependencies to offline version
 */
export async function offlineifyHtml(options: OfflineifyOptions): Promise<OfflineifyResult> {
  const { inputPath, outputDir: customOutputDir } = options;

  const htmlName = path.basename(inputPath, path.extname(inputPath));
  const outputDir = customOutputDir || path.join(os.tmpdir(), `offlineify-${Date.now()}`);
  const vendorDir = path.join(outputDir, 'vendor');

  await fs.ensureDir(outputDir);
  await fs.ensureDir(vendorDir);

  let html = await fs.readFile(inputPath, 'utf8');
  const vendorFiles: string[] = [];
  let appJsPath: string | undefined;

  // Extract and compile <script type="text/babel">
  const babelScriptMatch = html.match(
    /<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (babelScriptMatch) {
    const jsxCode = babelScriptMatch[1];

    // Resolve preset path from this package to avoid resolution issues in monorepo
    const presetPath = require.resolve('@babel/preset-react');
    const result = await babel.transformAsync(jsxCode, {
      presets: [[presetPath, { runtime: 'classic', development: false }]],
      filename: 'inline.jsx',
    });

    if (result?.code) {
      appJsPath = path.join(outputDir, 'app.js');
      await fs.writeFile(appJsPath, result.code, 'utf8');
    }
  }

  // Replacement rules for CDN scripts/styles
  const replacements: Array<{ regex: RegExp; replacement: string; vendorUrl?: string; vendorFile?: string }> = [
    {
      regex: /<script[^>]+cdn\.tailwindcss\.com[^>]*><\/script>/i,
      replacement: '<link rel="stylesheet" href="./vendor/tailwind.min.css">',
    },
    {
      regex: /<script[^>]+unpkg\.com\/react@18\/umd\/react\.development\.js[^>]*><\/script>/i,
      replacement: '<script src="./vendor/react.production.min.js"></script>',
      vendorUrl: 'https://unpkg.com/react@18/umd/react.production.min.js',
      vendorFile: 'react.production.min.js',
    },
    {
      regex: /<script[^>]+unpkg\.com\/react-dom@18\/umd\/react-dom\.development\.js[^>]*><\/script>/i,
      replacement: '<script src="./vendor/react-dom.production.min.js"></script>',
      vendorUrl: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
      vendorFile: 'react-dom.production.min.js',
    },
    {
      regex: /<script[^>]+@babel\/standalone[^>]*><\/script>\s*/i,
      replacement: '',
    },
    {
      regex: /<script[^>]+canvas-confetti[^>]*><\/script>/i,
      replacement: '<script src="./vendor/confetti.browser.min.js"></script>',
      vendorUrl: 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
      vendorFile: 'confetti.browser.min.js',
    },
  ];

  // Replace babel script with compiled app.js
  if (babelScriptMatch) {
    html = html.replace(babelScriptMatch[0], '<script src="./app.js"></script>');
  }

  // Apply replacements and download vendor files
  const downloadPromises: Promise<void>[] = [];

  for (const { regex, replacement, vendorUrl, vendorFile } of replacements) {
    if (regex.test(html)) {
      html = html.replace(regex, replacement);

      if (vendorUrl && vendorFile) {
        const destPath = path.join(vendorDir, vendorFile);
        downloadPromises.push(downloadFile(vendorUrl, destPath));
        vendorFiles.push(vendorFile);
      }
    }
  }

  // Remove Google Fonts imports
  html = html.replace(/@import url\(['"]https?:\/\/fonts\.googleapis\.com[^)]+\);?/g, '');

  // Save modified HTML
  const indexPath = path.join(outputDir, 'index.html');
  await fs.writeFile(indexPath, html, 'utf8');

  // Download vendor files in parallel
  await Promise.all(downloadPromises);

  // Generate Tailwind CSS if needed
  if (html.includes('./vendor/tailwind.min.css')) {
    await generateTailwindCss(outputDir, vendorDir, inputPath);
    vendorFiles.push('tailwind.min.css');
  }

  return {
    outputDir,
    indexPath,
    appJsPath,
    vendorFiles,
  };
}

/**
 * Generate minimal Tailwind CSS containing only used classes
 */
async function generateTailwindCss(
  outputDir: string,
  vendorDir: string,
  originalInputPath: string
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tailwind-'));
  const inputCss = path.join(tmpDir, 'input.css');

  await fs.writeFile(
    inputCss,
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
    'utf8'
  );

  const contentPaths = [
    path.join(outputDir, 'index.html'),
    path.join(outputDir, 'app.js'),
    originalInputPath,
  ].filter((p) => fs.existsSync(p));

  const contentArgs = contentPaths.flatMap((p) => ['--content', p]);

  // Use local tailwindcss CLI to avoid npx resolution issues in monorepo/containers
  const tailwindCli = getTailwindCliPath();
  const outputCss = path.join(vendorDir, 'tailwind.min.css');

  await execa('node', [
    tailwindCli,
    '-i', inputCss,
    '-o', outputCss,
    ...contentArgs,
    '--minify',
  ]);

  // Cleanup
  await fs.remove(tmpDir);
}

