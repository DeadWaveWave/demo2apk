# Demo2APK 部署指南

本文档详细介绍如何部署 Demo2APK 服务到生产环境。

> ⚠️ **注意**: Docker 镜像仅支持 **linux/amd64** 架构。Mac 用户（包括 Apple Silicon）请使用 [本地开发模式](#本地开发模式macos) 启动。

## 目录

1. [前置要求](#前置要求)
2. [快速部署（推荐）](#快速部署推荐)
3. [Docker 部署](#docker-部署)
4. [本地开发模式（macOS）](#本地开发模式macos)
5. [直接部署](#直接部署)
6. [Nginx 配置](#nginx-配置)
7. [监控和维护](#监控和维护)
8. [构建 Docker 镜像](#构建-docker-镜像)

## 前置要求

### 硬件要求

| 组件 | 最低配置 | 推荐配置    |
| ---- | -------- | ----------- |
| CPU  | 2 核     | 4 核+       |
| 内存 | 4 GB     | 8 GB+       |
| 存储 | 30 GB    | 100 GB+ SSD |

### 软件要求

- Docker 20+ 和 Docker Compose
- 或者: Node.js 20+, Java 17+, Android SDK

## 快速部署（推荐）

使用预构建的 Docker Hub 镜像，无需本地构建，**3 分钟完成部署**。

> ⚠️ 仅支持 Linux x86_64 服务器，不支持 macOS 和 ARM 架构。

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使权限生效
```

### 2. 创建部署目录

```bash
mkdir -p ~/demo2apk && cd ~/demo2apk
```

### 3. 下载部署配置

```bash
curl -O https://raw.githubusercontent.com/DeadWaveWave/demo2apk/main/docker-compose.deploy.yml
```

### 4. 启动服务

```bash
docker compose -f docker-compose.deploy.yml up -d
```

### 5. 验证部署

```bash
# 检查服务状态
docker compose -f docker-compose.deploy.yml ps

# 测试 API
curl http://localhost:3000/health
```

访问 **http://127.0.0.1:5173** 即可使用。

### 更新到最新版本

```bash
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```

---

## Docker 部署

如果需要自定义构建或修改代码，可以使用源码构建方式。

### 1. 准备服务器

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt install docker-compose-plugin
```

### 2. 克隆项目

```bash
git clone https://github.com/your-username/demo2apk.git
cd demo2apk
```

### 3. 配置环境变量

```bash
cp .env.example .env

# 编辑配置
nano .env
```

重要配置项:
```env
NODE_ENV=production
RATE_LIMIT_MAX=5
WORKER_CONCURRENCY=2
MOCK_BUILD=false
FILE_RETENTION_HOURS=2
```

### 4. 构建和启动

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 5. 验证部署

```bash
# 检查健康状态
curl http://localhost:3000/health

# 检查 API
curl http://localhost:3000/api
```

## 本地开发模式（macOS）

由于 Docker 镜像不支持 macOS（ARM64/x86），Mac 用户请使用本地开发模式：

### 前置要求

- Node.js 20+
- pnpm 9+
- Java 17+ (可通过 `brew install openjdk@17` 安装)
- Android SDK

### 启动步骤

```bash
# 1. 克隆项目
git clone https://github.com/DeadWaveWave/demo2apk.git
cd demo2apk

# 2. 安装依赖
pnpm install

# 3. 启动 Redis (使用 Docker)
docker run -d -p 6379:6379 redis:alpine

# 4. 构建项目
pnpm build

# 5. 启动服务 (在不同终端中运行)
pnpm dev        # API Server (端口 3000)
pnpm worker     # Build Worker
pnpm frontend   # Web UI (端口 5173)
```

访问 **http://localhost:5173** 即可使用。

---

## 直接部署

如果不使用 Docker，可以直接在服务器上部署。

### 1. 安装依赖

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# Java 17
sudo apt install -y openjdk-17-jdk-headless

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# 其他工具
sudo apt install -y unzip curl git
```

### 2. 安装 Android SDK

```bash
# 创建目录
sudo mkdir -p /opt/android-sdk/cmdline-tools
cd /opt/android-sdk/cmdline-tools

# 下载 command-line tools
sudo curl -O https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
sudo unzip commandlinetools-linux-11076708_latest.zip
sudo mv cmdline-tools latest
sudo rm commandlinetools-linux-11076708_latest.zip

# 设置环境变量
echo 'export ANDROID_HOME=/opt/android-sdk' | sudo tee /etc/profile.d/android.sh
echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' | sudo tee -a /etc/profile.d/android.sh
source /etc/profile.d/android.sh

# 接受许可并安装组件
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# 安装 Cordova
sudo npm install -g cordova
```

### 3. 部署应用

```bash
# 克隆项目
git clone https://github.com/DeadWaveWave/demo2apk.git /opt/demo2apk
cd /opt/demo2apk

# 安装依赖
pnpm install

# 构建
pnpm build

# 创建数据目录
sudo mkdir -p /var/lib/demo2apk/{builds,uploads}
sudo chown -R $USER:$USER /var/lib/demo2apk
```

### 4. 配置 Systemd 服务

API 服务:
```bash
sudo tee /etc/systemd/system/demo2apk-api.service << 'EOF'
[Unit]
Description=Demo2APK API Server
After=network.target redis.service

[Service]
Type=simple
User=demo2apk
WorkingDirectory=/opt/demo2apk
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=REDIS_URL=redis://localhost:6379
Environment=BUILDS_DIR=/var/lib/demo2apk/builds
Environment=UPLOADS_DIR=/var/lib/demo2apk/uploads
Environment=ANDROID_HOME=/opt/android-sdk
ExecStart=/usr/bin/node packages/backend/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

Worker 服务:
```bash
sudo tee /etc/systemd/system/demo2apk-worker.service << 'EOF'
[Unit]
Description=Demo2APK Build Worker
After=network.target redis.service

[Service]
Type=simple
User=demo2apk
WorkingDirectory=/opt/demo2apk
Environment=NODE_ENV=production
Environment=REDIS_URL=redis://localhost:6379
Environment=BUILDS_DIR=/var/lib/demo2apk/builds
Environment=UPLOADS_DIR=/var/lib/demo2apk/uploads
Environment=ANDROID_HOME=/opt/android-sdk
ExecStart=/usr/bin/node packages/backend/dist/worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

启动服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable demo2apk-api demo2apk-worker
sudo systemctl start demo2apk-api demo2apk-worker

# 检查状态
sudo systemctl status demo2apk-api
sudo systemctl status demo2apk-worker
```

## Nginx 配置

### 安装 Nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 配置反向代理

```bash
sudo tee /etc/nginx/sites-available/demo2apk << 'EOF'
upstream demo2apk_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 配置 (由 certbot 自动生成)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 文件上传大小限制
    client_max_body_size 100M;

    # 前端静态文件
    location / {
        root /opt/demo2apk/packages/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://demo2apk_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # 静态文件 (构建产物)
    location /downloads/ {
        alias /var/lib/demo2apk/builds/;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/demo2apk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 获取 SSL 证书

```bash
sudo certbot --nginx -d your-domain.com
```

## 监控和维护

### 日志查看

```bash
# Docker 部署
docker-compose logs -f api
docker-compose logs -f worker

# 直接部署
sudo journalctl -u demo2apk-api -f
sudo journalctl -u demo2apk-worker -f
```

### 清理旧文件

创建定时清理任务:
```bash
sudo tee /etc/cron.daily/demo2apk-cleanup << 'EOF'
#!/bin/bash
# 清理 2 小时前的构建文件
find /var/lib/demo2apk/builds -type f -mmin +120 -delete
find /var/lib/demo2apk/uploads -type d -mmin +120 -exec rm -rf {} +
EOF

sudo chmod +x /etc/cron.daily/demo2apk-cleanup
```

### 监控指标

建议监控以下指标:
- API 响应时间
- Worker 队列长度
- 构建成功率
- 磁盘使用量
- Redis 内存使用

### 备份

需要备份的数据:
- Redis 数据 (`/var/lib/redis/` 或 Docker volume)
- 环境配置 (`.env`)

### 更新部署

```bash
# Docker 部署
cd /opt/demo2apk
git pull
docker-compose build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 直接部署
cd /opt/demo2apk
git pull
pnpm install
pnpm build
sudo systemctl restart demo2apk-api demo2apk-worker
```

## 故障排除

### API 无响应

1. 检查服务状态: `systemctl status demo2apk-api`
2. 检查端口: `netstat -tlnp | grep 3000`
3. 检查日志: `journalctl -u demo2apk-api -n 100`

### 构建失败

1. 检查 Worker 日志: `journalctl -u demo2apk-worker -n 100`
2. 检查 Android SDK: `sdkmanager --list`
3. 检查 Java: `java -version`
4. 检查磁盘空间: `df -h`

### Redis 连接失败

1. 检查 Redis 状态: `systemctl status redis`
2. 测试连接: `redis-cli ping`
3. 检查配置: `cat /etc/redis/redis.conf | grep bind`

---

## 构建 Docker 镜像

如果需要自行构建镜像（例如修改代码后），可以使用以下命令：

### 构建 linux/amd64 镜像

```bash
# 构建 Backend 镜像
docker buildx build --platform linux/amd64 \
  -t your-username/demo2apk-backend:latest \
  -f packages/backend/Dockerfile \
  --push .

# 构建 Frontend 镜像
docker buildx build --platform linux/amd64 \
  -t your-username/demo2apk-frontend:latest \
  -f packages/frontend/Dockerfile \
  --push .
```

### 本地构建（当前架构）

```bash
# 构建所有镜像
docker compose build

# 启动服务
docker compose up -d
```

### 官方镜像

官方预构建镜像托管在 Docker Hub：

- `deadwavewave/demo2apk-backend:latest`
- `deadwavewave/demo2apk-frontend:latest`

拉取镜像：

```bash
docker pull deadwavewave/demo2apk-backend:latest
docker pull deadwavewave/demo2apk-frontend:latest
```

---

如有问题，请提交 Issue 或联系维护人员。
