import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupAndroidEnv } from '../../src/utils/android-sdk.js';

describe('Android SDK Utils', () => {
  describe('setupAndroidEnv', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Reset env before each test
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      // Restore original env
      process.env = originalEnv;
    });

    it('should set ANDROID_HOME environment variable', () => {
      const testPath = '/test/android/sdk';
      setupAndroidEnv(testPath);
      expect(process.env.ANDROID_HOME).toBe(testPath);
    });

    it('should set ANDROID_SDK_ROOT environment variable', () => {
      const testPath = '/test/android/sdk';
      setupAndroidEnv(testPath);
      expect(process.env.ANDROID_SDK_ROOT).toBe(testPath);
    });

    it('should add platform-tools to PATH', () => {
      const testPath = '/test/android/sdk';
      setupAndroidEnv(testPath);
      expect(process.env.PATH).toContain('/test/android/sdk/platform-tools');
    });

    it('should add cmdline-tools to PATH', () => {
      const testPath = '/test/android/sdk';
      setupAndroidEnv(testPath);
      expect(process.env.PATH).toContain('/test/android/sdk/cmdline-tools/latest/bin');
    });

    it('should not duplicate PATH entries when called multiple times', () => {
      const testPath = '/test/android/sdk';
      setupAndroidEnv(testPath);
      const firstPath = process.env.PATH;
      setupAndroidEnv(testPath);
      expect(process.env.PATH).toBe(firstPath);
    });
  });
});

