import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PwaSiteOptions {
  appName: string;
  shortName?: string;
  themeColor?: string;
  backgroundColor?: string;
  iconPath?: string;
}

export interface PwaExportResult {
  siteId: string;
  siteDir: string;
  success: boolean;
  error?: string;
}

function getDefaultIconPath(): string {
  return path.resolve(__dirname, '../../assets/default-icon.png');
}

async function resizeIcon(inputPath: string, outputPath: string, size: number): Promise<void> {
  await sharp(inputPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

function injectIntoHtml(html: string, opts: { manifestHref: string; swPath: string; themeColor: string }): string {
  let out = html;

  const hasManifest = /rel=["']manifest["']/i.test(out);
  const hasTheme = /name=["']theme-color["']/i.test(out);
  const hasSwRegister = /navigator\.serviceWorker\.register\(/.test(out) || /demo2apk-pwa-sw/i.test(out);

  const headInjection: string[] = [];
  if (!hasManifest) {
    headInjection.push(`<link rel="manifest" href="${opts.manifestHref}">`);
  }
  if (!hasTheme) {
    headInjection.push(`<meta name="theme-color" content="${opts.themeColor}">`);
  }

  if (headInjection.length > 0) {
    const headClose = out.search(/<\/head>/i);
    const block = `\n    <!-- demo2apk-pwa -->\n    ${headInjection.join('\n    ')}\n`;
    if (headClose !== -1) {
      out = out.slice(0, headClose) + block + out.slice(headClose);
    } else {
      out = block + out;
    }
  }

  if (!hasSwRegister) {
    const swScript = `\n    <!-- demo2apk-pwa-sw -->\n    <script>\n      if ('serviceWorker' in navigator) {\n        window.addEventListener('load', function () {\n          navigator.serviceWorker.register('${opts.swPath}');\n        });\n      }\n    </script>\n`;
    const bodyClose = out.search(/<\/body>/i);
    if (bodyClose !== -1) {
      out = out.slice(0, bodyClose) + swScript + out.slice(bodyClose);
    } else {
      out += swScript;
    }
  }

  return out;
}

function createServiceWorkerSource(): string {
  return `/* demo2apk PWA service worker (generic runtime cache) */
const CACHE_NAME = 'demo2apk-pwa-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/service-worker.js')) return;

  // Navigation: network first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', res.clone());
        return res;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Asset requests: cache-first + background update
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) await cache.put(req, fresh.clone());
        } catch {
          // Ignore update errors
        }
      })());
      return cached;
    }

    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  })());
});
`;
}

export async function addPwaSupport(siteDir: string, options: PwaSiteOptions): Promise<void> {
  const appName = options.appName || 'Demo2APK App';
  const shortName = options.shortName || appName;
  const themeColor = options.themeColor || '#0ea5e9';
  const backgroundColor = options.backgroundColor || '#0b1020';

  const iconInput = (options.iconPath && await fs.pathExists(options.iconPath))
    ? options.iconPath
    : getDefaultIconPath();

  await fs.ensureDir(siteDir);
  const iconsDir = path.join(siteDir, 'icons');
  await fs.ensureDir(iconsDir);

  await resizeIcon(iconInput, path.join(iconsDir, 'icon-192.png'), 192);
  await resizeIcon(iconInput, path.join(iconsDir, 'icon-512.png'), 512);

  const manifest = {
    name: appName,
    short_name: shortName,
    start_url: '.',
    scope: '.',
    display: 'standalone',
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };

  await fs.writeFile(
    path.join(siteDir, 'manifest.webmanifest'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  await fs.writeFile(path.join(siteDir, 'service-worker.js'), createServiceWorkerSource(), 'utf8');

  const indexPath = path.join(siteDir, 'index.html');
  if (await fs.pathExists(indexPath)) {
    const html = await fs.readFile(indexPath, 'utf8');
    const patched = injectIntoHtml(html, {
      manifestHref: './manifest.webmanifest',
      swPath: './service-worker.js',
      themeColor,
    });
    await fs.writeFile(indexPath, patched, 'utf8');
  }
}

export async function exportDirAsPwaSite(
  sourceDir: string,
  siteDir: string,
  options: PwaSiteOptions
): Promise<void> {
  await fs.remove(siteDir);
  await fs.ensureDir(siteDir);
  await fs.copy(sourceDir, siteDir);
  await addPwaSupport(siteDir, options);
}
