/**
 * Shared build-time environment helpers.
 *
 * Currently used to control whether intermediate build artifacts
 * (Cordova/Capacitor work directories, node_modules, etc.) are
 * automatically cleaned up after a successful build.
 */

/**
 * Whether to automatically clean up build artifacts after a successful build.
 *
 * Controlled via the CLEANUP_BUILD_ARTIFACTS environment variable:
 * - not set          → true  (default: clean up)
 * - "0", "false"     → false (keep build directories for inspection)
 * - anything else    → true
 */
export function shouldCleanupBuildArtifacts(): boolean {
  const raw = process.env.CLEANUP_BUILD_ARTIFACTS;
  if (raw === undefined) return true;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return true;
}


