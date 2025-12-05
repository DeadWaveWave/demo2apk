![Demo2APK](assets/image.png)

# Demo2APK 🚀

![License](https://img.shields.io/badge/license-MIT-blue)
![Stars](https://img.shields.io/github/stars/DeadWaveWave/demo2apk?style=social)
![Version](https://img.shields.io/badge/version-2.1.0-green)

**将你的 Vibe Coding 创意瞬间转化为可运行的 Android App。**

> 💡 **使用场景**：当你在 **Gemini**, **ChatGPT**, **DeepSeek**, **Qwen** 等平台构建了自己的 demo，想要将其下载到自己的手机上时，可以用该项目非常便捷地将文件打包成 APK 安装使用。不要随意接受别人的 APK 文件，这可能存在安全风险！

Demo2APK 是专为 Vibe Coding 用户打造的一键打包工具。无论你是有了一个绝妙的 HTML 原型，还是完成了一个 React 前端项目，只需上传文件，我们就能立刻为你生成可安装的 APK。无需配置复杂的 Android 开发环境，让你的创意触手可及。

## 🌐 免费公益站点

我们部署了一个**公益站点**，免费提供给大家使用：

👉 **[https://demo2apk.lasuo.ai](https://demo2apk.lasuo.ai)**

- 每个 IP 每小时 5 次构建限制
- 无需注册，开箱即用
- 功能完整，与自部署版本一致

希望能帮到大家！如果觉得有用，请给个 ⭐ Star 支持一下！

---

## ✨ 核心特性

*   **🎨 Web 界面支持**：沉浸式体验构建过程，支持**暗黑工程蓝图风格**。
*   **✏️ 个性化定制**：支持设置**自定义应用名称**和上传**应用图标**。
*   **📋 构建历史记录**：自动保存最近构建记录，支持刷新页面后**自动恢复**构建状态。
*   **⏳ 智能排队系统**：支持多任务并发控制与排队等待，实时显示队列位置。
*   **🔗 便捷分享**：构建完成后自动生成可分享的下载链接。
*   **⚡️ 极速构建**：优化后的云端流水线，分分钟交付 APK。
*   **🌐 全栈支持**：完美支持单页 HTML、React、Vite、Next.js 等主流前端技术栈。
*   **🧠 智能离线**：自动处理 CDN 资源和 JSX 编译，确保 App 在离线环境下流畅运行。
*   **🛡️ 智能限流**：合理的资源分配策略，支持开发模式下关闭限流。
*   **🧹 自动清理**：构建产物保留 2 小时后自动清理，保护隐私并节省空间。

## ⚠️ React 项目：避免白屏问题

> **重要提示**：如果你的 React/Vite 打包的 APK 显示**白屏/空白页面**，你需要添加 legacy 插件以兼容 Android WebView。

```bash
npm install -D @vitejs/plugin-legacy terser
```

```javascript
// vite.config.js
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 52', 'android >= 5'] })
  ],
  base: './'  // APK 必需！
})
```

📖 **[完整指南：React 项目打包要求](docs/REACT_PROJECT_REQUIREMENTS.md)** - 白屏问题的详细排查方案。

## 🚀 快速开始

### 方式一：Docker 部署（Linux 服务器）

使用预构建的 Docker 镜像，3 分钟部署到你的 Linux 服务器。

> ⚠️ Docker 镜像仅支持 **linux/amd64** 架构。macOS 用户请使用 [本地开发模式](#方式二本地开发macos--linux)。

```bash
# 1. 创建部署目录
mkdir -p ~/demo2apk && cd ~/demo2apk

# 2. 下载部署配置
curl -O https://raw.githubusercontent.com/DeadWaveWave/demo2apk/main/docker-compose.deploy.yml

# 3. 启动服务
docker compose -f docker-compose.deploy.yml up -d
```

访问 **http://127.0.0.1:5173** 即可使用 Web 界面。

**更新到最新版本：**
```bash
docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml up -d
```

### 方式二：本地开发（macOS / Linux）

macOS 用户或需要本地开发时使用：

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 Redis
docker run -d -p 6379:6379 redis:alpine

# 3. 构建项目
pnpm build

# 4. 启动所有服务 (在不同终端中运行)
pnpm dev        # 启动 API Server (端口 3000)
pnpm worker     # 启动构建 Worker
pnpm frontend   # 启动 Web 界面 (端口 5173)
```

访问 **http://localhost:5173** 即可使用 Web 界面。

### 方式二：使用 API

如果你更喜欢命令行或脚本集成，可以使用我们的 REST API。

**HTML 单文件打包：**

```bash
curl -X POST http://localhost:3000/api/build/html \
  -F "file=@test-demo.html" \
  -F "appName=TestDemo"
```

**React 项目打包：**

```bash
# 先将项目打包为 ZIP
zip -r test-react-app.zip test-react-app/

# 上传构建
curl -X POST http://localhost:3000/api/build/zip \
  -F "file=@test-react-app.zip" \
  -F "appName=TestReactApp"
```

更多 API 详情请参阅 [API 文档](docs/API.md)。

## ⚙️ 配置说明

### 限流策略 (Rate Limiting)

为了公平使用资源，默认启用限流：

*   **限制**：每小时每个 IP 最多 **5 次** 构建请求。
*   **开发模式**：在本地开发或测试时，可以通过环境变量关闭限流。

在 `.env` 文件中设置：

```bash
# 关闭限流 (仅用于开发/测试)
RATE_LIMIT_ENABLED=false

# 自定义限制 (默认 5)
RATE_LIMIT_MAX=10
```

### 文件保留策略

为了节省存储空间并保护用户数据：

*   **保留时间**：构建生成的 APK 和临时文件将在 **2 小时** 后自动删除。
*   **清理机制**：后台 Worker 每 30 分钟执行一次清理扫描。

可以通过环境变量修改：

```bash
# 文件保留时间 (小时)
FILE_RETENTION_HOURS=2
```

### 并发与排队 (Concurrency)

控制同时进行的构建任务数量，多余的任务将自动进入队列等待。

```bash
# 并发构建数量 (默认 2)
WORKER_CONCURRENCY=2
```

## 📝 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新历史。

## 📚 文档与资源

- **[API 文档](docs/API.md)** - 完整的 REST API 接口说明
- **[部署指南](DEPLOYMENT.md)** - 生产环境部署与配置详解
- **[React 项目指南](docs/REACT_PROJECT_REQUIREMENTS.md)** - 避免白屏问题的最佳实践

## 🛠️ 技术栈

*   **Frontend**: React, Vite, Tailwind CSS (Blueprint Style)
*   **Backend**: Node.js, Fastify, TypeScript
*   **Queue**: BullMQ, Redis
*   **Build**: Cordova, Capacitor, Gradle
*   **Deploy**: Docker, Docker Compose

## 📈 社区成长

[![Star History Chart](https://api.star-history.com/svg?repos=DeadWaveWave/demo2apk&type=Date)](https://star-history.com/#DeadWaveWave/demo2apk&Date)

---

**Made with ❤️ for Vibe Coding**
