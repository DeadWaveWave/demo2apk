/**
 * React Component Wrapper
 * 
 * Wraps standalone React/JSX/TSX component code into a complete
 * buildable project structure.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { extractAppNameFromCode } from './code-detector.js';

export interface WrapperOptions {
  code: string;
  appName?: string;
  outputDir?: string;
}

export interface WrapperResult {
  projectDir: string;
  indexHtml: string;
  mainFile: string;
  appFile: string;
  packageJson: string;
  viteConfig: string;
  isTypeScript: boolean;
}

/**
 * Detect if the code contains TypeScript syntax
 */
function isTypeScriptCode(code: string): boolean {
  const tsPatterns = [
    /:\s*(string|number|boolean|any|void|never|null|undefined)\b/,
    /interface\s+\w+\s*\{/,
    /type\s+\w+\s*=/,
    /<[A-Z][a-zA-Z0-9]*</, // Generic type parameters
    /as\s+(string|number|boolean|any|const)\b/,
    /React\.(FC|FunctionComponent|ComponentType|ReactNode|ReactElement)/,
    /useState<[^>]+>/,
    /useRef<[^>]+>/,
  ];
  
  return tsPatterns.some(pattern => pattern.test(code));
}

/**
 * Extract imports from code to determine dependencies
 */
function extractDependencies(code: string): string[] {
  const deps = new Set<string>();
  
  // Match import statements
  const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1];
    // Skip relative imports
    if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
      // Get the package name (handle scoped packages)
      const pkgName = pkg.startsWith('@') 
        ? pkg.split('/').slice(0, 2).join('/')
        : pkg.split('/')[0];
      deps.add(pkgName);
    }
  }
  
  return Array.from(deps);
}

/**
 * Check if code uses Tailwind CSS
 */
function usesTailwind(code: string): boolean {
  // Check for common Tailwind class patterns
  const tailwindPatterns = [
    /className\s*=\s*["'][^"']*\b(flex|grid|block|inline|hidden)\b/,
    /className\s*=\s*["'][^"']*\b(p-|m-|px-|py-|mx-|my-|pt-|pb-|pl-|pr-)/,
    /className\s*=\s*["'][^"']*\b(text-|bg-|border-|rounded-|shadow-)/,
    /className\s*=\s*["'][^"']*\b(w-|h-|min-|max-|gap-|space-)/,
    /className\s*=\s*["'][^"']*\b(sm:|md:|lg:|xl:|2xl:)/,
    /className\s*=\s*["'][^"']*\b(hover:|focus:|active:|disabled:)/,
  ];
  
  return tailwindPatterns.some(pattern => pattern.test(code));
}

/**
 * Check if code uses lucide-react icons
 */
function usesLucide(code: string): boolean {
  return /from\s+['"]lucide-react['"]/.test(code);
}

/**
 * Wrap a standalone React component into a complete project
 */
export async function wrapReactComponent(options: WrapperOptions): Promise<WrapperResult> {
  const { code, outputDir: customOutputDir } = options;
  
  const isTS = isTypeScriptCode(code);
  const ext = isTS ? 'tsx' : 'jsx';
  const useTailwind = usesTailwind(code);
  const useLucideIcons = usesLucide(code);
  
  // Extract or generate app name
  const extractedName = extractAppNameFromCode(code);
  const appName = options.appName || extractedName || 'App';
  
  // Create output directory
  const outputDir = customOutputDir || path.join(os.tmpdir(), `react-wrap-${Date.now()}`);
  await fs.ensureDir(outputDir);
  
  // Extract dependencies from the code
  const extractedDeps = extractDependencies(code);
  
  // Build package.json dependencies
  const dependencies: Record<string, string> = {
    'react': '^18.2.0',
    'react-dom': '^18.2.0',
  };
  
  // Add extracted dependencies with reasonable versions
  const knownVersions: Record<string, string> = {
    'lucide-react': '^0.344.0',
    'framer-motion': '^11.0.0',
    'clsx': '^2.1.0',
    'tailwind-merge': '^2.2.0',
    'date-fns': '^3.0.0',
    'zustand': '^4.5.0',
    'react-router-dom': '^6.22.0',
    'axios': '^1.6.0',
    '@tanstack/react-query': '^5.0.0',
  };
  
  for (const dep of extractedDeps) {
    if (dep !== 'react' && dep !== 'react-dom') {
      dependencies[dep] = knownVersions[dep] || '^0.0.0';
    }
  }
  
  // Force add lucide-react if detected
  if (useLucideIcons && !dependencies['lucide-react']) {
    dependencies['lucide-react'] = knownVersions['lucide-react'];
  }
  
  // Build devDependencies
  const devDependencies: Record<string, string> = {
    'vite': '^5.0.0',
    '@vitejs/plugin-react': '^4.2.0',
    '@vitejs/plugin-legacy': '^5.0.0',
    'terser': '^5.27.0',
  };
  
  if (isTS) {
    devDependencies['typescript'] = '^5.3.0';
    devDependencies['@types/react'] = '^18.2.0';
    devDependencies['@types/react-dom'] = '^18.2.0';
  }
  
  if (useTailwind) {
    devDependencies['tailwindcss'] = '^3.4.0';
    devDependencies['postcss'] = '^8.4.0';
    devDependencies['autoprefixer'] = '^10.4.0';
  }
  
  // Create package.json
  const packageJson = {
    name: appName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies,
    devDependencies,
  };
  
  const packageJsonPath = path.join(outputDir, 'package.json');
  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  
  // Create vite.config
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 52'],
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
  },
});
`;
  
  const viteConfigPath = path.join(outputDir, 'vite.config.js');
  await fs.writeFile(viteConfigPath, viteConfig, 'utf8');
  
  // Create TypeScript config if needed
  if (isTS) {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        noFallthroughCasesInSwitch: true,
      },
      include: ['src'],
    };
    
    await fs.writeJson(path.join(outputDir, 'tsconfig.json'), tsConfig, { spaces: 2 });
  }
  
  // Create Tailwind config if needed
  if (useTailwind) {
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;
    await fs.writeFile(path.join(outputDir, 'tailwind.config.js'), tailwindConfig, 'utf8');
    
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
    await fs.writeFile(path.join(outputDir, 'postcss.config.js'), postcssConfig, 'utf8');
  }
  
  // Create src directory
  const srcDir = path.join(outputDir, 'src');
  await fs.ensureDir(srcDir);
  
  // Create CSS file
  const cssContent = useTailwind 
    ? `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
body {
  margin: 0;
  min-height: 100vh;
}
`
    : `/* Custom styles */
body {
  margin: 0;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* {
  box-sizing: border-box;
}
`;
  
  await fs.writeFile(path.join(srcDir, 'index.css'), cssContent, 'utf8');
  
  // Create App file with the user's code
  const appFilePath = path.join(srcDir, `App.${ext}`);
  await fs.writeFile(appFilePath, code, 'utf8');
  
  // Create main.tsx/jsx (entry point)
  const mainContent = isTS
    ? `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
    : `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  
  const mainFilePath = path.join(srcDir, `main.${ext}`);
  await fs.writeFile(mainFilePath, mainContent, 'utf8');
  
  // Create index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#000000" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.${ext}"></script>
  </body>
</html>
`;
  
  const indexHtmlPath = path.join(outputDir, 'index.html');
  await fs.writeFile(indexHtmlPath, indexHtml, 'utf8');
  
  return {
    projectDir: outputDir,
    indexHtml: indexHtmlPath,
    mainFile: mainFilePath,
    appFile: appFilePath,
    packageJson: packageJsonPath,
    viteConfig: viteConfigPath,
    isTypeScript: isTS,
  };
}

/**
 * Create a ZIP file from the wrapped project
 */
export async function createProjectZip(projectDir: string, outputPath: string): Promise<string> {
  const { execa } = await import('execa');
  
  // Create ZIP in the parent directory
  const parentDir = path.dirname(projectDir);
  const projectName = path.basename(projectDir);
  
  await execa('zip', ['-r', outputPath, projectName], {
    cwd: parentDir,
  });
  
  return outputPath;
}

