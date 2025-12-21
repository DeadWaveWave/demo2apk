// Builders
export {
  buildHtmlToApk,
  buildHtmlProjectToApk,
  generateAppId,
  prepareHtmlForCordova,
  type HtmlBuildOptions,
  type HtmlProjectBuildOptions,
  type BuildResult,
} from './builders/html-builder.js';

export {
  buildReactToApk,
  type ReactBuildOptions,
} from './builders/react-builder.js';

// Utils
export {
  detectAndroidSdk,
  detectJava,
  detectCordova,
  checkBuildEnvironment,
  setupAndroidEnv,
  type AndroidSdkInfo,
} from './utils/android-sdk.js';

export {
  needsOfflineify,
  offlineifyHtml,
  type OfflineifyOptions,
  type OfflineifyResult,
} from './utils/offlineify.js';

export {
  fixViteProject,
  needsViteProjectFix,
  type FixResult,
} from './utils/react-project-fixer.js';

export {
  addPwaSupport,
  exportDirAsPwaSite,
  type PwaSiteOptions,
  type PwaExportResult,
} from './utils/pwa.js';

// Code Detection & Wrapping
export {
  detectCodeType,
  extractAppNameFromCode,
  isLikelyReactComponent,
  isLikelyHtmlWithReact,
  type CodeType,
  type DetectionResult,
} from './utils/code-detector.js';

export {
  wrapReactComponent,
  createProjectZip,
  type WrapperOptions,
  type WrapperResult,
} from './utils/react-wrapper.js';

// ZIP Detection
export {
  detectZipProjectType,
  getZipProjectTypeLabel,
  getRecommendedBuildApproach,
  type ZipProjectType,
  type ZipDetectionResult,
} from './utils/zip-detector.js';

// Android Permissions
export {
  ANDROID_PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_METADATA,
  DEFAULT_PERMISSIONS,
  validatePermissions,
  getFullPermissionName,
  getAvailablePermissions,
} from './utils/android-permissions.js';
