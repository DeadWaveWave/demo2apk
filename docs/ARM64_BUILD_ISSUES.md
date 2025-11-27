# Docker ARM64 构建问题总结

> 更新日期：2025-11-27
> 状态：已采用临时方案 (Rosetta 模拟)

## ⚠️ 问题现象

在 Apple Silicon Mac (ARM64) 上使用 Docker 构建 Android APK 时，遇到以下错误：

```text
rosetta error: failed to open elf at /lib64/ld-linux-x86-64.so.2
AAPT2 aapt2-8.7.3-12006047-linux Daemon #0: Unexpected error output
```

## 🔍 根本原因

**Google 不提供 Linux ARM64 版本的 Android build-tools (尤其是 aapt2)**

| 平台    | x86_64 | ARM64                |
| ------- | ------ | -------------------- |
| macOS   | ✅      | ✅ (Universal Binary) |
| Linux   | ✅      | ❌ **不提供**         |
| Windows | ✅      | ❌                    |

*   **本地 Mac 能跑**：因为 macOS 的 `aapt2` 是 Universal Binary，原生支持 ARM64。
*   **Docker 跑不了**：Docker 容器运行的是 Linux 环境，而 Linux 版 Android SDK 只有 x86_64 版本的 `aapt2`。

## 🐛 其他遇到的问题

1.  **npm 安装 cordova-android 失败**
    *   **原因**：npm 10.x 在 Cordova 项目中存在 bug，显示 "up to date" 但实际未安装包内容。
    *   **解决**：改用 `pnpm` 进行安装。

2.  **cordova-js 找不到**
    *   **原因**：`cordova platform add` 会触发 npm 脚本运行 `cordova-js build`，需要环境中有该工具。
    *   **解决**：需要全局安装 cordova 或使用 pnpm 正确处理依赖路径。

3.  **Gradle 运行时下载**
    *   **原因**：默认情况下 Gradle wrapper 会在运行时下载 Gradle，导致首次构建极慢且依赖网络。
    *   **解决**：在 Dockerfile 中预安装 Gradle 到 `/opt/gradle`。

## 🛠 解决方案

### 方案 A：强制使用 x86_64 模拟（当前采用）

在 Dockerfile 中强制指定架构，利用 Docker Desktop for Mac 的 Rosetta 2 模拟功能运行 x86_64 容器。

```dockerfile
# 在 Dockerfile 中强制使用 x86_64 架构
FROM --platform=linux/amd64 node:20-slim AS production
```

*   **优点**：能在 ARM Mac 上跑通完整流程。
*   **缺点**：构建速度较慢，性能有损耗。

### 方案 B：生产环境使用 x86_64 服务器（推荐）

在 x86_64 架构的 Linux 服务器上部署（如 AWS EC2, DigitalOcean 等），可获得原生性能，无兼容性问题。

### 方案 C：本地开发不用 Docker

直接在 Mac 本机运行服务，利用本地 Android SDK 的原生 ARM64 支持：

```bash
# 本地开发（不用 Docker）
pnpm dev      # API 服务
pnpm worker   # 构建 Worker
pnpm frontend # 前端
```

## 🚀 未来优化措施

| 优化项              | 之前         | 之后                          |
| ------------------- | ------------ | ----------------------------- |
| **Gradle**          | 运行时下载   | 预安装到 `/opt/gradle` 镜像中 |
| **cordova-android** | 每次构建下载 | pnpm 缓存加速                 |
| **包管理器**        | npm (有 bug) | pnpm (稳定)                   |
| **Android SDK**     | 仅基础安装   | 预安装 + 验证 aapt2           |

## 📄 关键文件修改记录

1.  **`packages/backend/Dockerfile`**
    *   添加 `--platform=linux/amd64`
    *   预安装 Gradle 环境

2.  **`packages/core/src/builders/html-builder.ts`**
    *   优化 Gradle 查找逻辑
    *   改用 `pnpm` 安装 `cordova-android` 以规避 npm bug

