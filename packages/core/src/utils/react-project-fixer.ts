import fs from 'fs-extra';
import path from 'path';

export interface FixResult {
  fixed: boolean;
  changes: string[];
}

/**
 * Known implicit/peer dependencies that libraries often require but don't declare properly.
 * Key: package name that triggers the need
 * Value: array of packages that should be installed alongside
 */
const IMPLICIT_DEPENDENCIES: Record<string, string[]> = {
  // recharts uses react-is internally but doesn't declare it as a dependency
  'recharts': ['react-is'],
  // framer-motion may need these on some setups
  'framer-motion': ['@emotion/is-prop-valid'],
  // react-spring ecosystem
  '@react-spring/web': ['@react-spring/shared', '@react-spring/animated'],
  // styled-components peer deps
  'styled-components': ['react-is'],
  // material-ui v5 peer deps
  '@mui/material': ['@emotion/react', '@emotion/styled'],
  // ant design
  'antd': ['@ant-design/icons'],
  // react-router needs react-router-dom for web
  'react-router': ['react-router-dom'],
};

/**
 * Fix Vite project configuration for APK compatibility
 * 
 * Common issues with AI-generated projects (Google AI Studio, etc.):
 * 1. Missing `base: './'` - causes asset loading issues in APK WebView
 * 2. Legacy plugin not configured - causes blank screen on older Android WebViews
 * 3. Missing index.css generation for Tailwind
 */
export async function fixViteProject(projectDir: string): Promise<FixResult> {
  const changes: string[] = [];

  // Check if this is a Vite project
  const viteConfigPath = await findViteConfig(projectDir);
  if (!viteConfigPath) {
    return { fixed: false, changes: [] };
  }

  // Read package.json to check for dependencies
  const pkgPath = path.join(projectDir, 'package.json');
  let pkg: Record<string, unknown> = {};
  if (await fs.pathExists(pkgPath)) {
    pkg = await fs.readJson(pkgPath);
  }

  // Check if legacy plugin is installed
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) };
  const hasLegacyPlugin = '@vitejs/plugin-legacy' in deps;
  const hasTerser = 'terser' in deps;

  // Read and fix vite.config
  let viteConfig = await fs.readFile(viteConfigPath, 'utf8');
  const originalConfig = viteConfig;

  // 1. Fix base path
  if (!viteConfig.includes("base:") && !viteConfig.includes("base :")) {
    viteConfig = addBaseToViteConfig(viteConfig);
    changes.push("Added base: './' for correct asset paths in APK");
  }

  // 2. Add legacy plugin if available but not configured
  if (hasLegacyPlugin && !viteConfig.includes('legacy')) {
    viteConfig = addLegacyPluginToViteConfig(viteConfig);
    changes.push("Enabled @vitejs/plugin-legacy for Android WebView compatibility");
  }

  // 3. Install legacy plugin if not present
  if (!hasLegacyPlugin) {
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
    devDeps['@vitejs/plugin-legacy'] = '^6.0.0';
    devDeps['terser'] = '^5.31.0';
    pkg.devDependencies = devDeps;
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });

    // Also add to vite config
    viteConfig = addLegacyPluginToViteConfig(viteConfig);
    changes.push("Added @vitejs/plugin-legacy and terser to dependencies");
  }

  // Write back if changed
  if (viteConfig !== originalConfig) {
    await fs.writeFile(viteConfigPath, viteConfig, 'utf8');
  }

  // Normalize CSS @import placement to avoid PostCSS errors
  await normalizeCssImports(projectDir, changes);

  // 4. Check for index.css and Tailwind setup
  await ensureIndexCss(projectDir, changes);

  // 5. Setup Tailwind if project uses it
  if (await hasTailwindClasses(projectDir)) {
    await setupTailwind(projectDir, changes);
  }

  // 6. Add missing implicit/peer dependencies
  await addMissingImplicitDependencies(projectDir, changes);

  // 7. Remove import maps from HTML (AI Studio projects use CDN imports that don't work in APK)
  await removeImportMaps(projectDir, changes);

  // 8. Remove CDN resources from HTML (Tailwind, fonts, etc. don't work offline in APK)
  await removeCdnResources(projectDir, changes);

  // 9. Guard performance.measure so legacy WebViews不会因为缺少 mark 直接抛异常把脚本打断
  await injectPerformanceMeasureGuard(projectDir, changes);

  // 10. Fix Babel config with invalid plugins (null/undefined/false entries cause build failures)
  await fixBabelConfig(projectDir, changes);

  return {
    fixed: changes.length > 0,
    changes,
  };
}

/**
 * Find vite.config file (supports .js, .ts, .mjs, .mts)
 */
async function findViteConfig(projectDir: string): Promise<string | null> {
  const possibleNames = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
  ];

  for (const name of possibleNames) {
    const configPath = path.join(projectDir, name);
    if (await fs.pathExists(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Add base: './' to vite config
 */
function addBaseToViteConfig(config: string): string {
  // Handle defineConfig with arrow function returning object
  // Pattern: defineConfig(({ ... }) => { return { ... } })
  const returnPattern = /return\s*\{/;
  if (returnPattern.test(config)) {
    return config.replace(returnPattern, "return {\n      base: './',");
  }

  // Pattern: defineConfig({ ... })
  const defineConfigPattern = /defineConfig\s*\(\s*\{/;
  if (defineConfigPattern.test(config)) {
    return config.replace(defineConfigPattern, "defineConfig({\n  base: './',");
  }

  // Pattern: export default { ... }
  const exportDefaultPattern = /export\s+default\s*\{/;
  if (exportDefaultPattern.test(config)) {
    return config.replace(exportDefaultPattern, "export default {\n  base: './',");
  }

  return config;
}

/**
 * Add legacy plugin to vite config
 */
function addLegacyPluginToViteConfig(config: string): string {
  // Already has legacy
  if (config.includes('legacy')) {
    return config;
  }

  // Add import at the top
  const hasLegacyImport = config.includes("from '@vitejs/plugin-legacy'") ||
    config.includes('from "@vitejs/plugin-legacy"');

  if (!hasLegacyImport) {
    // Find the last import statement and add after it
    const importMatch = config.match(/^import .+$/gm);
    if (importMatch && importMatch.length > 0) {
      const lastImport = importMatch[importMatch.length - 1];
      config = config.replace(
        lastImport,
        lastImport + "\nimport legacy from '@vitejs/plugin-legacy';"
      );
    } else {
      // No imports, add at the beginning
      config = "import legacy from '@vitejs/plugin-legacy';\n" + config;
    }
  }

  // Add legacy to plugins array
  // Pattern: plugins: [react()]
  const pluginsPattern = /plugins\s*:\s*\[([^\]]*)\]/;
  const pluginsMatch = config.match(pluginsPattern);

  if (pluginsMatch) {
    const existingPlugins = pluginsMatch[1].trim();
    const legacyConfig = `legacy({ 
        targets: ['chrome >= 52', 'android >= 5'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime']
      })`;

    if (existingPlugins) {
      // Add after existing plugins
      config = config.replace(
        pluginsPattern,
        `plugins: [${existingPlugins}, ${legacyConfig}]`
      );
    } else {
      config = config.replace(
        pluginsPattern,
        `plugins: [${legacyConfig}]`
      );
    }
  }

  return config;
}

/**
 * Ensure index.css exists (for projects that reference it but don't have it)
 */
async function ensureIndexCss(projectDir: string, changes: string[]): Promise<void> {
  // Check if index.html references index.css
  const indexHtmlPath = path.join(projectDir, 'index.html');
  if (!(await fs.pathExists(indexHtmlPath))) {
    return;
  }

  const indexHtml = await fs.readFile(indexHtmlPath, 'utf8');

  // Check for CSS reference that might not exist
  const cssRefMatch = indexHtml.match(/href=["']\/?(index\.css)["']/);
  if (!cssRefMatch) {
    return;
  }

  const cssPath = path.join(projectDir, 'index.css');
  const rootReset = `/* Ensured by Demo2APK */\nhtml, body, #root {\n  height: 100%;\n  width: 100%;\n  margin: 0;\n  padding: 0;\n}\n`;

  // Check if file needs Tailwind directives
  const hasTailwind = indexHtml.includes('tailwind') ||
    await hasTailwindInConfig(projectDir) ||
    await hasTailwindClasses(projectDir);

  let cssExists = await fs.pathExists(cssPath);

  if (cssExists) {
    // Check if existing file needs Tailwind directives
    if (hasTailwind) {
      const existingCss = await fs.readFile(cssPath, 'utf8');
      // Only treat real @tailwind directives (not commented out ones) as present
      const hasRealTailwindDirective = /(\\n|^)\\s*@tailwind\\s+(base|components|utilities)/m.test(existingCss);
      if (!hasRealTailwindDirective) {
        // Prepend Tailwind directives
        const newCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

${existingCss}`;
        await fs.writeFile(cssPath, newCss, 'utf8');
        changes.push("Added Tailwind directives to index.css");
      }
    }
    // Ensure root full-size reset exists
    const ensureCss = await fs.readFile(cssPath, 'utf8');
    if (!ensureCss.includes('html, body, #root')) {
      await fs.appendFile(cssPath, `\n${rootReset}`, 'utf8');
      changes.push("Added root full-size CSS to index.css");
    }
  } else {
    // Create a new CSS file
    if (hasTailwind) {
      await fs.writeFile(cssPath, `@tailwind base;
@tailwind components;
@tailwind utilities;
`, 'utf8');
      changes.push("Created index.css with Tailwind directives");
    } else {
      await fs.writeFile(cssPath, `/* Auto-generated CSS file */
`, 'utf8');
      changes.push("Created missing index.css file");
    }

    // Safety: ensure root reset exists (for files we just created)
    try {
      const createdCss = await fs.readFile(cssPath, 'utf8');
      if (!createdCss.includes('html, body, #root')) {
        await fs.appendFile(cssPath, `\n${rootReset}`, 'utf8');
        changes.push("Ensured root full-size CSS in new index.css");
      }
    } catch { }
  }

  // Legacy fallback: support Tailwind's aspect-square on old WebViews (no aspect-ratio support)
  try {
    let cssContent = await fs.readFile(cssPath, 'utf8');
    const marker = '/* DEMO2APK_ASPECT_SQUARE_FALLBACK */';
    if (!cssContent.includes(marker)) {
      const fallback = `
${marker}
@supports not (aspect-ratio: 1 / 1) {
  .aspect-square {
    position: relative;
  }
  .aspect-square::before {
    content: '';
    display: block;
    padding-top: 100%;
  }
  .aspect-square > * {
    position: absolute;
    inset: 0;
  }
}
`;
      cssContent += fallback;
      await fs.writeFile(cssPath, cssContent, 'utf8');
      changes.push("Added legacy aspect-square fallback for old Android WebViews");
    }
  } catch {
    // Non-fatal: continue without fallback if read/write fails
  }
}

/**
 * Check if project uses Tailwind CSS
 */
async function hasTailwindInConfig(projectDir: string): Promise<boolean> {
  const possibleConfigs = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
  ];

  for (const configName of possibleConfigs) {
    if (await fs.pathExists(path.join(projectDir, configName))) {
      return true;
    }
  }

  // Check package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ('tailwindcss' in deps) {
      return true;
    }
  }

  // Scan source files for Tailwind class patterns
  return await hasTailwindClasses(projectDir);
}

/**
 * Scan source files for Tailwind CSS class patterns
 */
async function hasTailwindClasses(projectDir: string): Promise<boolean> {
  // Common Tailwind class patterns
  const tailwindPatterns = [
    /\bflex\b/,
    /\bgrid\b/,
    /\bbg-\w+/,
    /\btext-\w+/,
    /\bp-\d+/,
    /\bm-\d+/,
    /\brounded/,
    /\bshadow/,
    /\bborder-/,
    /\bspace-/,
  ];

  const sourceExtensions = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'];

  async function scanDir(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          if (await scanDir(fullPath)) {
            return true;
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (sourceExtensions.includes(ext)) {
            const content = await fs.readFile(fullPath, 'utf8');
            for (const pattern of tailwindPatterns) {
              if (pattern.test(content)) {
                return true;
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors reading directories
    }

    return false;
  }

  return scanDir(projectDir);
}

/**
 * Add missing implicit/peer dependencies based on installed packages.
 * 
 * Many popular React libraries have implicit dependencies that they use
 * but don't declare in their package.json (or only as peer deps).
 * This causes Vite/Rollup to fail with "cannot resolve" errors.
 * 
 * Example: recharts uses react-is internally but doesn't declare it.
 */
async function addMissingImplicitDependencies(projectDir: string, changes: string[]): Promise<void> {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!(await fs.pathExists(pkgPath))) {
    return;
  }

  const pkg = await fs.readJson(pkgPath);
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const missingDeps: Record<string, string> = {};

  // Check each known library and its implicit dependencies
  for (const [trigger, implicitDeps] of Object.entries(IMPLICIT_DEPENDENCIES)) {
    if (trigger in allDeps) {
      for (const implicitDep of implicitDeps) {
        // Only add if not already present
        if (!(implicitDep in allDeps) && !(implicitDep in missingDeps)) {
          // Use 'latest' or a known compatible version
          missingDeps[implicitDep] = getRecommendedVersion(implicitDep);
        }
      }
    }
  }

  // Also scan source files for direct imports of packages that might be missing
  const sourceImports = await scanSourceImports(projectDir);
  for (const importedPkg of sourceImports) {
    // Skip relative imports, node built-ins, and already installed packages
    if (importedPkg.startsWith('.') ||
      importedPkg.startsWith('/') ||
      isNodeBuiltin(importedPkg) ||
      importedPkg in allDeps ||
      importedPkg in missingDeps) {
      continue;
    }

    // Check if this is a known implicit dependency we should add
    if (importedPkg === 'react-is' ||
      importedPkg.startsWith('@emotion/') ||
      importedPkg.startsWith('@react-spring/')) {
      missingDeps[importedPkg] = getRecommendedVersion(importedPkg);
    }
  }

  // Add missing dependencies to package.json
  if (Object.keys(missingDeps).length > 0) {
    const deps = (pkg.dependencies || {}) as Record<string, string>;
    Object.assign(deps, missingDeps);
    pkg.dependencies = deps;
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });

    const addedList = Object.keys(missingDeps).join(', ');
    changes.push(`Added missing implicit dependencies: ${addedList}`);
  }
}

/**
 * Get recommended version for a package
 */
function getRecommendedVersion(pkg: string): string {
  const versions: Record<string, string> = {
    'react-is': '^18.2.0',
    '@emotion/is-prop-valid': '^1.2.0',
    '@emotion/react': '^11.11.0',
    '@emotion/styled': '^11.11.0',
    '@react-spring/shared': '^9.7.0',
    '@react-spring/animated': '^9.7.0',
    '@ant-design/icons': '^5.0.0',
    'react-router-dom': '^6.0.0',
  };
  return versions[pkg] || '*';
}

/**
 * Check if a module name is a Node.js builtin
 */
function isNodeBuiltin(name: string): boolean {
  const builtins = [
    'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util',
    'stream', 'events', 'buffer', 'querystring', 'assert', 'child_process',
    'cluster', 'dgram', 'dns', 'domain', 'net', 'readline', 'repl',
    'string_decoder', 'tls', 'tty', 'v8', 'vm', 'zlib', 'process',
  ];
  return builtins.includes(name) || name.startsWith('node:');
}

/**
 * Scan source files for import statements and return package names
 */
async function scanSourceImports(projectDir: string): Promise<Set<string>> {
  const imports = new Set<string>();
  const sourceExtensions = ['.tsx', '.jsx', '.ts', '.js', '.mjs', '.mts'];

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist' || entry.name === 'build') {
            continue;
          }
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (sourceExtensions.includes(ext)) {
            const content = await fs.readFile(fullPath, 'utf8');

            // Match import statements: import ... from 'package'
            const importMatches = content.matchAll(/import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g);
            for (const match of importMatches) {
              const importPath = match[1];
              const pkgName = getPackageName(importPath);
              if (pkgName) {
                imports.add(pkgName);
              }
            }

            // Match require statements: require('package')
            const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
            for (const match of requireMatches) {
              const importPath = match[1];
              const pkgName = getPackageName(importPath);
              if (pkgName) {
                imports.add(pkgName);
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors reading directories
    }
  }

  await scanDir(projectDir);
  return imports;
}

/**
 * Extract package name from an import path
 * Examples:
 *   'react' -> 'react'
 *   'react-dom/client' -> 'react-dom'
 *   '@mui/material' -> '@mui/material'
 *   '@mui/material/Button' -> '@mui/material'
 *   './component' -> null (relative)
 */
function getPackageName(importPath: string): string | null {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null;
  }

  // Scoped package: @scope/name
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }

  // Regular package: name or name/subpath
  const parts = importPath.split('/');
  return parts[0];
}

/**
 * Setup Tailwind CSS for projects that use it without proper configuration
 */
async function setupTailwind(projectDir: string, changes: string[]): Promise<void> {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!(await fs.pathExists(pkgPath))) {
    return;
  }

  const pkg = await fs.readJson(pkgPath);
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const typographyPkg = '@tailwindcss/typography';
  const typographyVersion = '^0.5.19';

  let wrotePackageJson = false;

  // Check if we need to add Tailwind dependencies
  if (!('tailwindcss' in deps)) {
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
    devDeps['tailwindcss'] = '^3.4.0';
    devDeps['postcss'] = '^8.4.31';
    devDeps['autoprefixer'] = '^10.4.16';
    pkg.devDependencies = devDeps;
    wrotePackageJson = true;
    changes.push("Added tailwindcss, postcss, autoprefixer devDependencies");
  }

  // Tailwind Typography plugin (provides the `prose` class used by many templates)
  if (!(typographyPkg in deps)) {
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
    devDeps[typographyPkg] = typographyVersion;
    pkg.devDependencies = devDeps;
    wrotePackageJson = true;
    changes.push(`Added ${typographyPkg} devDependency`);
  }

  if (wrotePackageJson) {
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });
  }

  // Create postcss.config.js if missing
  const postcssConfigPath = path.join(projectDir, 'postcss.config.js');
  if (!(await fs.pathExists(postcssConfigPath))) {
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
    await fs.writeFile(postcssConfigPath, postcssConfig, 'utf8');
    changes.push("Created postcss.config.js");
  }

  await ensureTailwindTypographyPlugin(projectDir, changes);
}

async function ensureTailwindTypographyPlugin(projectDir: string, changes: string[]): Promise<void> {
  const configCandidates = [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.mts',
  ];

  const configName = await (async (): Promise<string | null> => {
    for (const name of configCandidates) {
      if (await fs.pathExists(path.join(projectDir, name))) {
        return name;
      }
    }
    return null;
  })();

  const configPath = configName ? path.join(projectDir, configName) : path.join(projectDir, 'tailwind.config.js');

  if (!configName) {
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx,html}",
    "!./node_modules/**/*",
    "!./dist/**/*",
    "!./build/**/*",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      }
    },
  },
  plugins: [typography],
}
`;
    await fs.writeFile(configPath, tailwindConfig, 'utf8');
    changes.push(`Created ${path.basename(configPath)} (with typography plugin)`);
    return;
  }

  let config = await fs.readFile(configPath, 'utf8');
  if (config.includes("@tailwindcss/typography")) {
    return;
  }

  const ext = path.extname(configPath).toLowerCase();
  const isCjs = ext === '.cjs' || /\bmodule\.exports\b/.test(config);

  const updated = isCjs
    ? addTypographyToTailwindConfigCjs(config)
    : addTypographyToTailwindConfigEsm(config);

  if (updated !== config) {
    await fs.writeFile(configPath, updated, 'utf8');
    changes.push(`Enabled @tailwindcss/typography in ${path.basename(configPath)}`);
  }
}

function addTypographyToTailwindConfigEsm(config: string): string {
  let updated = config;

  // Ensure import exists
  if (!/\bimport\s+typography\s+from\s+['"]@tailwindcss\/typography['"]/.test(updated)) {
    const importLine = `import typography from '@tailwindcss/typography';\n\n`;
    const headerMatch = updated.match(/^\s*\/\*\*[\s\S]*?\*\/\s*/);
    if (headerMatch) {
      updated = `${headerMatch[0]}${importLine}${updated.slice(headerMatch[0].length)}`;
    } else {
      updated = `${importLine}${updated}`;
    }
  }

  // Ensure plugins contains typography
  const pluginsRegex = /plugins\s*:\s*\[([\s\S]*?)\]/m;
  if (pluginsRegex.test(updated)) {
    updated = updated.replace(pluginsRegex, (match, inner: string) => {
      if (/\btypography\b/.test(inner) || /@tailwindcss\/typography/.test(inner)) {
        return match;
      }

      const trimmed = inner.trim().replace(/,\s*$/, '');
      const nextInner = trimmed ? `${trimmed}, typography` : 'typography';
      return `plugins: [${nextInner}]`;
    });
    return updated;
  }

  // Fallback: add plugins field near the end of the exported config object
  const lastBrace = updated.lastIndexOf('}');
  if (lastBrace === -1) {
    return config;
  }

  let insertAt = lastBrace;
  let j = insertAt - 1;
  while (j >= 0 && /\s/.test(updated[j])) {
    j--;
  }
  const prevChar = j >= 0 ? updated[j] : '';
  const leadingComma = prevChar && prevChar !== '{' && prevChar !== ',' ? ',' : '';

  return `${updated.slice(0, insertAt)}${leadingComma}\n  plugins: [typography],\n${updated.slice(insertAt)}`;
}

function addTypographyToTailwindConfigCjs(config: string): string {
  let updated = config;
  const pluginsRegex = /plugins\s*:\s*\[([\s\S]*?)\]/m;

  if (pluginsRegex.test(updated)) {
    updated = updated.replace(pluginsRegex, (match, inner: string) => {
      if (/require\(\s*['"]@tailwindcss\/typography['"]\s*\)/.test(inner) || /@tailwindcss\/typography/.test(inner)) {
        return match;
      }

      const trimmed = inner.trim().replace(/,\s*$/, '');
      const pluginEntry = `require('@tailwindcss/typography')`;
      const nextInner = trimmed ? `${trimmed}, ${pluginEntry}` : pluginEntry;
      return `plugins: [${nextInner}]`;
    });
    return updated;
  }

  const lastBrace = updated.lastIndexOf('}');
  if (lastBrace === -1) {
    return config;
  }

  let insertAt = lastBrace;
  let j = insertAt - 1;
  while (j >= 0 && /\s/.test(updated[j])) {
    j--;
  }
  const prevChar = j >= 0 ? updated[j] : '';
  const leadingComma = prevChar && prevChar !== '{' && prevChar !== ',' ? ',' : '';
  const pluginLine = `\n  plugins: [require('@tailwindcss/typography')],\n`;
  return `${updated.slice(0, insertAt)}${leadingComma}${pluginLine}${updated.slice(insertAt)}`;
}

/**
 * Move @import rules to the top of CSS files and inline <style> blocks.
 * Prevents PostCSS/Vite errors that require imports before other statements.
 */
async function normalizeCssImports(projectDir: string, changes: string[]): Promise<void> {
  const cssExtensions = new Set(['.css', '.pcss', '.scss', '.sass', '.less']);
  const htmlExtensions = new Set(['.html', '.htm']);
  let normalized = false;

  async function processCssLikeFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const raw = await fs.readFile(filePath, 'utf8');

    if (cssExtensions.has(ext)) {
      const { css, changed } = reorderCssImports(raw);
      if (changed) {
        await fs.writeFile(filePath, css, 'utf8');
        normalized = true;
      }
      return;
    }

    if (htmlExtensions.has(ext)) {
      const newHtml = raw.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, cssBlock) => {
        const { css, changed } = reorderCssImports(cssBlock);
        if (!changed) {
          return match;
        }
        normalized = true;
        return match.replace(cssBlock, css);
      });

      if (newHtml !== raw) {
        await fs.writeFile(filePath, newHtml, 'utf8');
      }
    }
  }

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        await processCssLikeFile(fullPath);
      }
    }
  }

  await walk(projectDir);

  if (normalized) {
    changes.push("Normalized CSS @import order to place imports at top");
  }
}

/**
 * Move @import statements before any other CSS rules, keeping @charset first.
 */
function reorderCssImports(css: string): { css: string; changed: boolean } {
  const charsetMatch = css.match(/^\s*@charset[^;]+;\s*/i);
  const charset = charsetMatch ? charsetMatch[0] : '';
  let body = charsetMatch ? css.slice(charset.length) : css;

  const importRegex = /^\s*@import[^;]+;\s*/gm;
  const imports = Array.from(body.matchAll(importRegex)).map((m) => m[0]);
  if (imports.length === 0) {
    return { css, changed: false };
  }

  body = body.replace(importRegex, '').trimStart();
  const newCss = `${charset}${imports.join('')}${imports.length && body ? '\n' : ''}${body}`;
  return { css: newCss, changed: newCss !== css };
}

/**
 * Remove import maps from HTML files.
 * 
 * AI Studio and some online tools generate projects that use import maps
 * to load dependencies from CDN (e.g., https://aistudiocdn.com).
 * These don't work in offline APK environments and cause white screens.
 * 
 * This function removes <script type="importmap"> blocks from HTML files
 * so that Vite can bundle dependencies properly from node_modules.
 */
async function removeImportMaps(projectDir: string, changes: string[]): Promise<void> {
  const htmlFiles = [
    path.join(projectDir, 'index.html'),
    path.join(projectDir, 'public', 'index.html'),
  ];

  let removed = false;

  for (const htmlPath of htmlFiles) {
    if (!(await fs.pathExists(htmlPath))) {
      continue;
    }

    const html = await fs.readFile(htmlPath, 'utf8');

    // Match <script type="importmap">...</script> blocks (multiline)
    const importMapRegex = /<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi;

    if (importMapRegex.test(html)) {
      const cleanedHtml = html.replace(importMapRegex, '');
      await fs.writeFile(htmlPath, cleanedHtml, 'utf8');
      removed = true;
    }
  }

  if (removed) {
    changes.push('Removed CDN import maps from HTML (incompatible with APK offline environment)');
  }
}

/**
 * Remove CDN resources from HTML files.
 * 
 * Many projects use CDN versions of Tailwind CSS, fonts, and other resources
 * that don't work in offline APK environments. This function removes:
 * - CDN Tailwind CSS scripts (https://cdn.tailwindcss.com)
 * - External font links (Google Fonts, etc.)
 * - Other CDN resources
 * 
 * Projects should use locally installed packages instead.
 */
async function removeCdnResources(projectDir: string, changes: string[]): Promise<void> {
  const htmlFiles = [
    path.join(projectDir, 'index.html'),
    path.join(projectDir, 'public', 'index.html'),
  ];

  const removedItems: string[] = [];

  for (const htmlPath of htmlFiles) {
    if (!(await fs.pathExists(htmlPath))) {
      continue;
    }

    let html = await fs.readFile(htmlPath, 'utf8');
    const originalHtml = html;

    // Remove CDN Tailwind CSS script
    const tailwindCdnRegex = /<script[^>]*src=["']https?:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>[\s\S]*?<\/script>/gi;
    if (tailwindCdnRegex.test(html)) {
      html = html.replace(tailwindCdnRegex, '');
      removedItems.push('CDN Tailwind CSS');
    }

    // Remove external font preconnects and links (Google Fonts, etc.)
    const fontPreconnectRegex = /<link[^>]*rel=["']preconnect["'][^>]*href=["']https?:\/\/fonts\.(googleapis|gstatic)\.com[^"']*["'][^>]*>/gi;
    const fontLinkRegex = /<link[^>]*href=["']https?:\/\/fonts\.googleapis\.com[^"']*["'][^>]*>/gi;

    if (fontPreconnectRegex.test(html)) {
      html = html.replace(fontPreconnectRegex, '');
      removedItems.push('Font preconnect');
    }

    if (fontLinkRegex.test(html)) {
      html = html.replace(fontLinkRegex, '');
      removedItems.push('External fonts');
    }

    // Remove inline tailwind.config scripts that assume global `tailwind` from CDN
    const inlineTailwindConfigRegex = /<script[^>]*>\s*tailwind\.config\s*=[\s\S]*?<\/script>/gi;
    if (inlineTailwindConfigRegex.test(html)) {
      html = html.replace(inlineTailwindConfigRegex, '');
      removedItems.push('Inline tailwind.config script');
    }

    // Write back if changed
    if (html !== originalHtml) {
      await fs.writeFile(htmlPath, html, 'utf8');
    }
  }

  if (removedItems.length > 0) {
    changes.push(`Removed offline-incompatible CDN resources: ${removedItems.join(', ')}`);
  }
}

/**
 * Inject a small guard around performance.measure() to avoid DOMException
 * crashing the whole bundle on old WebViews (e.g. Chrome 75).
 */
async function injectPerformanceMeasureGuard(projectDir: string, changes: string[]): Promise<void> {
  const indexHtmlPath = path.join(projectDir, 'index.html');
  if (!(await fs.pathExists(indexHtmlPath))) {
    return;
  }

  let html = await fs.readFile(indexHtmlPath, 'utf8');
  const marker = 'DEMO2APK_PERFORMANCE_MEASURE_GUARD';

  if (html.includes(marker)) {
    return;
  }

  const patch = `
    <script>
      // ${marker}: Prevent legacy WebViews from crashing on missing performance marks
      (function () {
        if (typeof window === 'undefined' || !('performance' in window)) return;
        var perf = window.performance;
        if (!perf || typeof perf.measure !== 'function') return;
        var originalMeasure = perf.measure.bind(perf);
        perf.measure = function(name, startMark, endMark) {
          try {
            return originalMeasure(name, startMark, endMark);
          } catch (e) {
            // Older Chrome/WebView 会在各种 measure 参数不合法时抛 DOMException/TypeError，
            // 这些对功能没有影响，这里统一吞掉，避免打断整个 bundle 执行。
            return;
          }
        };
      })();
    </script>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${patch}\n</head>`);
    await fs.writeFile(indexHtmlPath, html, 'utf8');
    changes.push('Injected performance.measure guard script for legacy WebViews');
  }
}

/**
 * Check if a project is an "AI Studio style" project that needs fixing
 * 
 * Characteristics:
 * - Has vite.config but missing base path
 * - References TSX/TS files directly in HTML
 * - May be missing proper build configuration
 */
export async function needsViteProjectFix(projectDir: string): Promise<boolean> {
  const viteConfigPath = await findViteConfig(projectDir);
  if (!viteConfigPath) {
    return false;
  }

  const viteConfig = await fs.readFile(viteConfigPath, 'utf8');

  // Check for missing base
  const hasBase = viteConfig.includes("base:") || viteConfig.includes("base :");

  // Check for missing legacy plugin
  const hasLegacy = viteConfig.includes('legacy');

  return !hasBase || !hasLegacy;
}

/**
 * Fix Babel configuration files that may contain invalid plugins entries.
 * 
 * Some AI-generated projects or templates use conditional expressions in the plugins array
 * that evaluate to null/undefined/false in different environments, causing:
 *   "[vite:build-html] .plugins[X] must be a string, object, function"
 * 
 * This function scans common Babel config locations and removes invalid entries.
 */
async function fixBabelConfig(projectDir: string, changes: string[]): Promise<void> {
  // Common Babel config file names
  const babelConfigFiles = [
    '.babelrc',
    '.babelrc.json',
    '.babelrc.js',
    '.babelrc.cjs',
    '.babelrc.mjs',
    'babel.config.json',
    'babel.config.js',
    'babel.config.cjs',
    'babel.config.mjs',
  ];

  // Check each potential Babel config file
  for (const configFile of babelConfigFiles) {
    const configPath = path.join(projectDir, configFile);
    if (!(await fs.pathExists(configPath))) {
      continue;
    }

    try {
      const ext = path.extname(configFile).toLowerCase();

      if (ext === '.json' || configFile === '.babelrc') {
        // Handle JSON config files
        await fixBabelJsonConfig(configPath, changes);
      } else if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
        // Handle JS config files - more complex, we do basic regex cleanup
        await fixBabelJsConfig(configPath, changes);
      }
    } catch (error) {
      // Non-fatal: continue with other configs
      console.error(`Failed to fix Babel config ${configFile}:`, error);
    }
  }

  // Also check package.json for babel key
  const pkgPath = path.join(projectDir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      await fixBabelInPackageJson(pkgPath, changes);
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Fix Babel JSON config file (.babelrc, babel.config.json)
 */
async function fixBabelJsonConfig(configPath: string, changes: string[]): Promise<void> {
  const content = await fs.readFile(configPath, 'utf8');

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content);
  } catch {
    return; // Invalid JSON, skip
  }

  let modified = false;

  // Fix plugins array
  if (Array.isArray(config.plugins)) {
    const plugins = config.plugins as unknown[];
    const originalLength = plugins.length;
    const filteredPlugins = plugins.filter((plugin: unknown) => {
      // Keep valid plugin entries (strings, arrays, objects), filter out null/undefined/false
      return plugin !== null && plugin !== undefined && plugin !== false && plugin !== '';
    });
    if (filteredPlugins.length !== originalLength) {
      config.plugins = filteredPlugins;
      modified = true;
    }
  }

  // Fix presets array
  if (Array.isArray(config.presets)) {
    const presets = config.presets as unknown[];
    const originalLength = presets.length;
    const filteredPresets = presets.filter((preset: unknown) => {
      return preset !== null && preset !== undefined && preset !== false && preset !== '';
    });
    if (filteredPresets.length !== originalLength) {
      config.presets = filteredPresets;
      modified = true;
    }
  }

  if (modified) {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    changes.push(`Fixed invalid entries in ${path.basename(configPath)}`);
  }
}

/**
 * Fix Babel JS config file - uses regex to clean obvious invalid patterns
 * This is a best-effort approach since we can't safely evaluate JS code
 */
async function fixBabelJsConfig(configPath: string, changes: string[]): Promise<void> {
  let content = await fs.readFile(configPath, 'utf8');
  const originalContent = content;

  // Pattern to match arrays with null, undefined, false, or empty string entries
  // This handles patterns like: [plugin1, null, plugin2] or [plugin1, false && 'plugin', plugin2]
  const cleanupPatterns = [
    // Remove standalone null, undefined, false followed by comma
    /,\s*null\s*(?=,|\])/g,
    /,\s*undefined\s*(?=,|\])/g,
    /,\s*false\s*(?=,|\])/g,
    // Remove null, undefined, false at the start of array followed by comma
    /\[\s*null\s*,/g,
    /\[\s*undefined\s*,/g,
    /\[\s*false\s*,/g,
    // Remove patterns like: condition && 'plugin' where condition evaluates to false
    /,\s*false\s*&&\s*['"][^'"]+['"]\s*(?=,|\])/g,
  ];

  for (const pattern of cleanupPatterns) {
    content = content.replace(pattern, (match) => {
      // Replace with cleaned version
      if (match.startsWith('[')) {
        return '[';
      }
      return '';
    });
  }

  // Also filter out obvious .filter(Boolean) patterns that might not be applied
  // Add .filter(Boolean) to plugins/presets arrays if they contain conditional expressions
  if (content !== originalContent) {
    await fs.writeFile(configPath, content, 'utf8');
    changes.push(`Cleaned invalid entries in ${path.basename(configPath)}`);
  }
}

/**
 * Fix Babel config inside package.json
 */
async function fixBabelInPackageJson(pkgPath: string, changes: string[]): Promise<void> {
  const pkg = await fs.readJson(pkgPath);

  if (!pkg.babel || typeof pkg.babel !== 'object') {
    return;
  }

  let modified = false;

  // Fix plugins array
  if (Array.isArray(pkg.babel.plugins)) {
    const originalLength = pkg.babel.plugins.length;
    pkg.babel.plugins = pkg.babel.plugins.filter((plugin: unknown) => {
      return plugin !== null && plugin !== undefined && plugin !== false && plugin !== '';
    });
    if (pkg.babel.plugins.length !== originalLength) {
      modified = true;
    }
  }

  // Fix presets array
  if (Array.isArray(pkg.babel.presets)) {
    const originalLength = pkg.babel.presets.length;
    pkg.babel.presets = pkg.babel.presets.filter((preset: unknown) => {
      return preset !== null && preset !== undefined && preset !== false && preset !== '';
    });
    if (pkg.babel.presets.length !== originalLength) {
      modified = true;
    }
  }

  if (modified) {
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    changes.push('Fixed invalid Babel entries in package.json');
  }
}

