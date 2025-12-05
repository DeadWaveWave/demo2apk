# Changelog

All notable changes to this project will be documented in this file.

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

