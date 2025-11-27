import { describe, it, expect } from 'vitest';
import { needsOfflineify } from '../../src/utils/offlineify.js';

describe('Offlineify Utils', () => {
  describe('needsOfflineify', () => {
    it('should return true for HTML with Tailwind CDN', () => {
      const html = '<script src="https://cdn.tailwindcss.com"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with unpkg React', () => {
      const html = '<script src="https://unpkg.com/react@18/umd/react.development.js"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with Google Fonts', () => {
      const html = '@import url("https://fonts.googleapis.com/css2?family=Roboto");';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with Babel standalone', () => {
      const html = '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with text/babel script', () => {
      const html = '<script type="text/babel">const App = () => <h1>Hello</h1>;</script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with canvas-confetti', () => {
      const html = '<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return true for HTML with cdnjs', () => {
      const html = '<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });

    it('should return false for HTML without CDN dependencies', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Local Page</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <script src="app.js"></script>
</body>
</html>`;
      expect(needsOfflineify(html)).toBe(false);
    });

    it('should return false for empty HTML', () => {
      expect(needsOfflineify('')).toBe(false);
    });

    it('should be case insensitive', () => {
      const html = '<script src="HTTPS://CDN.TAILWINDCSS.COM"></script>';
      expect(needsOfflineify(html)).toBe(true);
    });
  });
});

