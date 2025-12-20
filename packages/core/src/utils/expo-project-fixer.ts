import fs from 'fs-extra';
import path from 'path';

export interface FixResult {
  fixed: boolean;
  changes: string[];
}

function hasExpoDependency(pkg: any): boolean {
  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };
  return typeof deps === 'object' && deps != null && ('expo' in deps || 'expo-router' in deps);
}

async function patchExpoConfigJson(configPath: string, changes: string[]): Promise<boolean> {
  let raw: any;
  try {
    raw = await fs.readJson(configPath);
  } catch {
    return false;
  }

  if (!raw || typeof raw !== 'object') {
    return false;
  }

  if (!raw.expo || typeof raw.expo !== 'object') {
    return false;
  }

  const web = (raw.expo.web && typeof raw.expo.web === 'object') ? raw.expo.web : {};
  const output = web.output;

  // `server` output requires a Node runtime and API routes, which cannot run inside an offline APK WebView.
  // `static` output triggers server-side rendering during export which is brittle in our build sandbox.
  if (output === 'server' || output === 'static') {
    web.output = 'single';
    raw.expo.web = web;
    await fs.writeJson(configPath, raw, { spaces: 2 });
    changes.push(`Set expo.web.output to "single" in ${path.basename(configPath)}`);
    return true;
  }

  return false;
}

async function patchExpoConfigScript(configPath: string, changes: string[]): Promise<boolean> {
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch {
    return false;
  }

  // Best-effort: only touch the `web: { output: "server"|"static" }` configuration.
  const webOutputRegex = /(web\s*:\s*\{[\s\S]*?output\s*:\s*['"])(server|static)(['"])/m;
  if (!webOutputRegex.test(content)) {
    return false;
  }

  const updated = content.replace(webOutputRegex, `$1single$3`);
  if (updated === content) {
    return false;
  }

  await fs.writeFile(configPath, updated, 'utf8');
  changes.push(`Set expo.web.output to "single" in ${path.basename(configPath)}`);
  return true;
}

/**
 * Expo SDK packages ship TypeScript source in node_modules. Some templates enable
 * `web.output: "server"` or `"static"` which requires running portions of the app
 * in Node during export. This often fails in generic build sandboxes.
 *
 * For APK builds (offline WebView), we force Expo web output to SPA (`single`) when possible.
 */
export async function fixExpoProject(projectDir: string): Promise<FixResult> {
  const changes: string[] = [];

  const pkgPath = path.join(projectDir, 'package.json');
  if (!(await fs.pathExists(pkgPath))) {
    return { fixed: false, changes };
  }

  let pkg: any;
  try {
    pkg = await fs.readJson(pkgPath);
  } catch {
    return { fixed: false, changes };
  }

  if (!hasExpoDependency(pkg)) {
    return { fixed: false, changes };
  }

  const configCandidates = [
    path.join(projectDir, 'app.json'),
    path.join(projectDir, 'app.config.json'),
    path.join(projectDir, 'app.config.js'),
    path.join(projectDir, 'app.config.ts'),
    path.join(projectDir, 'app.config.mjs'),
    path.join(projectDir, 'app.config.cjs'),
  ];

  let patched = false;
  for (const configPath of configCandidates) {
    if (!(await fs.pathExists(configPath))) {
      continue;
    }
    const ext = path.extname(configPath).toLowerCase();
    const didPatch = ext === '.json'
      ? await patchExpoConfigJson(configPath, changes)
      : await patchExpoConfigScript(configPath, changes);

    if (didPatch) {
      patched = true;
    }
  }

  return { fixed: patched, changes };
}
