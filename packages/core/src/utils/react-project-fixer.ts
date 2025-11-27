import fs from 'fs-extra';
import path from 'path';

export interface FixResult {
  fixed: boolean;
  changes: string[];
}

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
  
  // 4. Check for index.css and Tailwind setup
  await ensureIndexCss(projectDir, changes);
  
  // 5. Setup Tailwind if project uses it
  if (await hasTailwindClasses(projectDir)) {
    await setupTailwind(projectDir, changes);
  }

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
  
  // Check if file needs Tailwind directives
  const hasTailwind = indexHtml.includes('tailwind') || 
                      await hasTailwindInConfig(projectDir) ||
                      await hasTailwindClasses(projectDir);
  
  if (await fs.pathExists(cssPath)) {
    // Check if existing file needs Tailwind directives
    if (hasTailwind) {
      const existingCss = await fs.readFile(cssPath, 'utf8');
      if (!existingCss.includes('@tailwind')) {
        // Prepend Tailwind directives
        const newCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

${existingCss}`;
        await fs.writeFile(cssPath, newCss, 'utf8');
        changes.push("Added Tailwind directives to index.css");
      }
    }
    return;
  }
  
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
 * Setup Tailwind CSS for projects that use it without proper configuration
 */
async function setupTailwind(projectDir: string, changes: string[]): Promise<void> {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!(await fs.pathExists(pkgPath))) {
    return;
  }
  
  const pkg = await fs.readJson(pkgPath);
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  
  // Check if we need to add Tailwind dependencies
  if (!('tailwindcss' in deps)) {
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
    devDeps['tailwindcss'] = '^3.4.0';
    devDeps['postcss'] = '^8.4.31';
    devDeps['autoprefixer'] = '^10.4.16';
    pkg.devDependencies = devDeps;
    await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    changes.push("Added tailwindcss, postcss, autoprefixer dependencies");
  }
  
  // Create tailwind.config.js if missing
  const tailwindConfigPath = path.join(projectDir, 'tailwind.config.js');
  if (!(await fs.pathExists(tailwindConfigPath))) {
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
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
  plugins: [],
}
`;
    await fs.writeFile(tailwindConfigPath, tailwindConfig, 'utf8');
    changes.push("Created tailwind.config.js");
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

