# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] - 2026-01-05

### 🚀 Features (新特性)

- **PWA Support (PWA 支持)**:
  - Added PWA generation and export capabilities to builders.
  - Generate installable web versions alongside APK builds.
- **Android Permission Selection (Android 权限选择)**:
  - New permission selection UI for customizing Android permissions.
  - Inject chosen permissions into the build process.
  - Default includes INTERNET access with optional additional permissions.
- **Expo Project Support (Expo 项目支持)**:
  - Added Expo project fixer to set web output to 'single' for offline APK compatibility.
- **Tailwind Typography Plugin (Tailwind Typography 插件)**:
  - Automatically configure `@tailwindcss/typography` plugin for generated and fixed projects.
- **Enhanced Directory Name Handling (增强的目录名处理)**:
  - Convert non-ASCII characters to pinyin for directory names.
  - Ensure ASCII-safe names for Java/Gradle compatibility.
- **Kotlin Duplicate Class Fix (Kotlin 重复类修复)**:
  - Implement `patchKotlinDuplicateClasses` function to modify build.gradle.
  - Prevent Kotlin stdlib duplicate-class errors by excluding legacy JDK7/8 artifacts.
- **Logging Improvements (日志改进)**:
  - Added `LOGS_DIR` environment variable to Docker Compose configuration.
  - Improved logging management capabilities.
- **Gradle Wrapper Enhancement (Gradle Wrapper 增强)**:
  - Export `ensureGradleWrapper` function for reuse in React builder.
  - Enhanced Gradle setup logic to check for both wrapper script and JAR existence.

### 🐛 Fixes (修复)

- **Babel Configuration (Babel 配置)**:
  - Remove invalid null/undefined/false entries from Babel config files.
  - Clean up package.json plugins/presets arrays.
- **ZIP Parsing (ZIP 解析)**:
  - Improve zip file content parsing in `listZipContents` function.
  - Replace regex with whitespace splitting for better cross-platform compatibility.
- **Error Handling (错误处理)**:
  - Enhanced error handling for build job creation.
  - Implement conditional cleanup of uploaded files.

## [2.2.0] - 2025-12-09


### 🚀 Features (新特性)

- **App Version Support (版本号支持)**:
  - Added support for specifying `appVersion` (e.g., 1.0.0) during upload.
  - Defaults to '1.0.0' if not provided.
- **Structured Logging (结构化日志)**:
  - Implemented JSONL logging format for better observability.
  - Added `log:stats` script for analyzing log statistics.
- **Enhanced App ID Generation (增强的 App ID 生成)**:
  - Improved `appId` generation with pinyin support for non-ASCII names.
  - Changed default prefix to `com.demo2apk` and ensured unique package IDs.
- **Multi-file HTML Support (多文件 HTML 支持)**:
  - Automatic detection of multi-file HTML projects in ZIP archives.
  - No build step required for HTML projects, direct packaging.
- **React Project Fixer (React 项目修复)**:
  - Enhanced compatibility fixes including CSS import normalization and CDN resource removal.
- **Guide Section (新手引导)**:
  - Added visual guide component for project uploads.

### 🐛 Fixes (修复)

- **Filename Handling**: Updated task ID regex to allow underscores and hyphens.
- **Cleanup Configuration**: Added periodic cleanup of old builds and configurable retention.

## [2.1.0] - 2025-12-05

### 🚀 Features (新特性)

- **Build History (构建历史)**: 
  - Added a local history panel on the homepage to track recent builds.
  - Automatically saves build status and allows quick restoration/download.
  - Supports clearing history and removing individual items.
- **Session Persistence (会话持久化)**:
  - Build state is now preserved via URL parameters (`?task=...`).
  - Refreshing the page automatically restores the build progress or result.
- **Smart Queuing System (智能排队系统)**:
  - Implemented reliable concurrent build limits (configurable via `WORKER_CONCURRENCY`).
  - Added real-time queue position display (e.g., "Position #1 of 3").
- **Progress Heartbeat (进度心跳)**:
  - Added periodic progress updates for long-running tasks (npm install, Gradle build) to prevent UI from appearing stuck.
- **UI Improvements**:
  - Enhanced "Dark Blueprint" theme with violet accents for history panel.
  - Added "Select All" support for Task IDs.
  - Improved upload zone with clearer drag-and-drop feedback.

### 🐛 Fixes (修复)

- **Concurrency Issues**: Fixed `WORKER_CONCURRENCY` environment variable not being loaded in worker process (missing dotenv).
- **File Conflicts**: Fixed race condition where concurrent builds of the same app name would overwrite each other's APK files. Now uses Task ID for unique filenames.
- **Queue Status**: Fixed incorrect "0/0" queue position display when tasks were waiting.
- **Download Names**: Fixed downloaded files showing as ".apk" without a name in some cases.

### 📚 Documentation (文档)

- Updated `README.md` and `README_CN.md` with new features and configuration options.
- Added documentation for concurrency settings.

---

## [2.0.0] - 2025-12-04

### 🚀 Major Release

- **Monorepo Structure**: Refactored into `packages/core`, `packages/backend`, and `packages/frontend`.
- **React Support**: Added full support for building React/Vite projects from ZIP files.
- **New UI**: Complete redesign with "Engineering Blueprint" aesthetic.
- **BullMQ Integration**: Robust job queue system backed by Redis.
- **Docker Support**: Production-ready Docker Compose setup.

