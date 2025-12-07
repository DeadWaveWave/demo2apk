import { describe, it, expect } from 'vitest';
import { generateAppId, prepareHtmlForCordova } from '../../src/builders/html-builder.js';

describe('HtmlBuilder', () => {
  describe('generateAppId', () => {
    it('should generate valid package ID from simple app name', () => {
      const result = generateAppId('MyApp');
      expect(result).toBe('com.demo2apk.myapp');
    });

    it('should handle app name with spaces', () => {
      const result = generateAppId('My Cool App');
      expect(result).toBe('com.demo2apk.mycoolapp');
    });

    it('should handle app name starting with number', () => {
      const result = generateAppId('123App');
      expect(result).toBe('com.demo2apk.a123app');
    });

    it('should handle Chinese characters', () => {
      const result = generateAppId('我的应用');
      // Chinese characters are converted to pinyin and concatenated without dots
      expect(result).toBe('com.demo2apk.wodeyingyong');
    });

    it('should handle mixed special characters', () => {
      const result = generateAppId('My_App-Test!@#');
      expect(result).toBe('com.demo2apk.myapptest');
    });

    it('should handle empty string', () => {
      const result = generateAppId('');
      expect(result).toBe('com.demo2apk.app');
    });

    it('should handle only special characters', () => {
      const result = generateAppId('!@#$%');
      expect(result).toBe('com.demo2apk.app');
    });

    it('should handle multiple consecutive special characters', () => {
      const result = generateAppId('My---App___Test');
      expect(result).toBe('com.demo2apk.myapptest');
    });
  });

  describe('prepareHtmlForCordova', () => {
    it('should add viewport meta tag if not present', () => {
      const html = '<html><head></head><body></body></html>';
      const result = prepareHtmlForCordova(html);
      expect(result).toContain('viewport');
      expect(result).toContain('width=device-width');
    });

    it('should not duplicate viewport meta tag', () => {
      const html = '<html><head><meta name="viewport" content="existing"></head><body></body></html>';
      const result = prepareHtmlForCordova(html);
      const matches = result.match(/viewport/g);
      expect(matches).toHaveLength(1);
    });

    it('should add Content-Security-Policy meta tag if not present', () => {
      const html = '<html><head></head><body></body></html>';
      const result = prepareHtmlForCordova(html);
      expect(result).toContain('Content-Security-Policy');
    });

    it('should not duplicate CSP meta tag', () => {
      const html = '<html><head><meta http-equiv="Content-Security-Policy" content="existing"></head><body></body></html>';
      const result = prepareHtmlForCordova(html);
      const matches = result.match(/Content-Security-Policy/g);
      expect(matches).toHaveLength(1);
    });

    it('should add cordova.js reference if not present', () => {
      const html = '<html><head></head><body></body></html>';
      const result = prepareHtmlForCordova(html);
      expect(result).toContain('<script src="cordova.js"></script>');
    });

    it('should not duplicate cordova.js reference', () => {
      const html = '<html><head></head><body><script src="cordova.js"></script></body></html>';
      const result = prepareHtmlForCordova(html);
      const matches = result.match(/cordova\.js/g);
      expect(matches).toHaveLength(1);
    });

    it('should handle complex HTML with all tags needed', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>`;
      const result = prepareHtmlForCordova(html);
      expect(result).toContain('viewport');
      expect(result).toContain('Content-Security-Policy');
      expect(result).toContain('cordova.js');
    });
  });
});

