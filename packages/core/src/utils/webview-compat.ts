import fs from 'fs-extra';
import path from 'path';

export const DEMO2APK_RUNTIME_SCRIPT_FILENAME = 'demo2apk-runtime.js';

export const DEMO2APK_RUNTIME_SCRIPT_CONTENT = `(() => {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isHybrid = typeof window.cordova !== 'undefined' || typeof window.Capacitor !== 'undefined';
  if (!isAndroid || !isHybrid) return;

  const normalizeAccept = (accept) => {
    const parts = accept
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const lower = parts.map((p) => p.toLowerCase());
    const hasProblematicMime = lower.some((p) => {
      if (p === 'application/json' || p === 'text/json') return true;
      if (p.startsWith('font/')) return true;
      if (p.includes('opentype')) return true;
      if (p.includes('x-font')) return true;
      return false;
    });
    if (hasProblematicMime) return '*/*';

    const hasExt = parts.some((p) => p.startsWith('.'));
    if (!hasExt) return null;

    const mimeParts = parts.filter((p) => p.includes('/') || p === '*/*');
    if (mimeParts.length > 0) return mimeParts.join(',');

    return '*/*';
  };

  const patchFileInput = (input) => {
    if (input.dataset && input.dataset.demo2apkAcceptPatched === '1') return;
    if (input.dataset) input.dataset.demo2apkAcceptPatched = '1';

    const accept = input.getAttribute('accept');
    if (!accept) return;

    const normalized = normalizeAccept(accept);
    if (!normalized) return;

    if (normalized !== accept) {
      input.setAttribute('accept', normalized);
    }
  };

  const patchFileInputs = (root) => {
    if (!root || !root.querySelectorAll) return;
    const inputs = root.querySelectorAll('input[type=\"file\"][accept]');
    inputs.forEach((el) => {
      if (el instanceof HTMLInputElement) patchFileInput(el);
    });
  };

  const getBlob = (url) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = () => reject(new Error('Failed to load blob URL'));
      xhr.send();
    });

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Unexpected FileReader result'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });

  const tryNativeSave = async (href, fileName) => {
    const downloader = window.Demo2APKBlobDownloader;
    if (href.startsWith('data:')) {
      downloader.saveBase64Data(href, fileName);
      return true;
    }

    if (href.startsWith('blob:')) {
      const blob = await getBlob(href);
      const dataUrl = await blobToDataUrl(blob);
      downloader.saveBase64Data(dataUrl, fileName);
      return true;
    }

    return false;
  };

  const onClickCapture = (event) => {
    const target = event && event.target;
    const anchor = target && target.closest ? target.closest('a') : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const fileName = anchor.getAttribute('download') || anchor.download;
    if (!fileName) return;

    const href = anchor.getAttribute('href') || anchor.href;
    if (!href || (!href.startsWith('blob:') && !href.startsWith('data:'))) return;

    const downloader = window.Demo2APKBlobDownloader;
    if (!downloader || typeof downloader.saveBase64Data !== 'function') return;

    event.preventDefault();

    void (async () => {
      try {
        await tryNativeSave(href, fileName);
      } catch {
        // Best-effort fallback: try default navigation.
        try {
          window.location.href = href;
        } catch {
          // Ignore
        }
      }
    })();
  };

  const init = () => {
    patchFileInputs(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          patchFileInputs(node);
        });
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener('click', onClickCapture, true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();\n`;

export async function writeDemo2apkRuntimeScript(targetDir: string): Promise<string> {
  const outPath = path.join(targetDir, DEMO2APK_RUNTIME_SCRIPT_FILENAME);
  await fs.writeFile(outPath, DEMO2APK_RUNTIME_SCRIPT_CONTENT, 'utf8');
  return outPath;
}

export function injectDemo2apkRuntimeScriptTag(html: string): string {
  if (html.includes(DEMO2APK_RUNTIME_SCRIPT_FILENAME)) {
    return html;
  }

  const scriptTag = `    <script src="${DEMO2APK_RUNTIME_SCRIPT_FILENAME}"></script>\n`;
  const match = html.match(/<\/body\s*>/i);
  if (!match || match.index === undefined) {
    return `${html}\n${scriptTag}`;
  }

  const idx = match.index;
  return html.slice(0, idx) + scriptTag + html.slice(idx);
}
