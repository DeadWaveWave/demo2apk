// Builders
export {
  buildHtmlToApk,
  generateAppId,
  prepareHtmlForCordova,
  type HtmlBuildOptions,
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
