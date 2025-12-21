# PWA 发布（独立子域 / 方案 B）

本项目支持在构建 APK 的同时，额外导出一个可安装的 PWA 站点（静态文件）。核心目标是：**每个发布一个独立 origin**，避免用户内容与主站/API 同源带来的安全风险。

> 这份文档面向“准备做社区/项目发布”的部署方式：**用户发布内容在 `*.pwa.<domain>`，主站/API 在另一个域名**。

## 0. 推荐架构（强隔离）

- 主站（UI）：`https://app.example.com`
- API：`https://api.example.com`
- 用户发布/PWA：`https://<pwaSiteId>.pwa.example.com`

这样浏览器侧的 `cookie/localStorage/service worker` 天然隔离，用户内容不会“同源污染”主站。

## 1. 工作方式

- 构建请求携带 `publishPwa=true` 后，Worker 会把构建出来的 Web 产物复制到 `PWA_DIR/<pwaSiteId>/`。
- 同时自动生成：
  - `manifest.webmanifest`
  - `service-worker.js`（通用 runtime cache）
  - `icons/icon-192.png`、`icons/icon-512.png`
  - 并对 `index.html` 注入 manifest 引用与 SW 注册脚本（如果用户项目未自带）。

构建状态接口 `/api/build/:taskId/status` 会返回：

- `pwa.siteId`
- `pwa.url`（当配置了 `PWA_HOST_SUFFIX`）
- `pwa.success / pwa.error`

## 2. 必需前置：DNS + HTTPS

PWA（Service Worker）要求 **HTTPS**（或 `http://localhost`）。

假设你选择：

- 主站/UI：`app.example.com`
- API：`api.example.com`
- PWA 发布域：`*.pwa.example.com`

你需要：

1. DNS 增加 `A/AAAA` 记录：`*.pwa.example.com -> 你的服务器 IP`
2. 配置通配符证书：`*.pwa.example.com`（通常需要 DNS-01 验证）

> 说明：通配符证书一般不能用 HTTP-01，需要 DNS-01（例如 certbot 的 DNS 插件、acme.sh 等，取决于你的 DNS 服务商）。

## 3. 环境变量

在 API 与 Worker 上都需要启用（至少 Worker 需要写文件）：

- `PWA_ENABLED=true`
- `PWA_DIR=/var/lib/demo2apk/pwa-sites`（或任意可持久化目录）
- `PWA_HOST_SUFFIX=pwa.example.com`（可选：用于返回完整 URL）
- `PWA_URL_SCHEME=https`（可选，默认 `https`）
- `PWA_RETENTION_HOURS=2`（可选，默认跟随 `FILE_RETENTION_HOURS`）

### 3.1 Docker 部署时的目录规划（非常关键）

PWA 站点是静态文件，需要被 Nginx 直接读到。推荐使用宿主机固定目录（bind mount），例如：

- `PWA_DIR=/var/lib/demo2apk/pwa-sites`
- `BUILDS_DIR=/var/lib/demo2apk/builds`
- `UPLOADS_DIR=/var/lib/demo2apk/uploads`

然后在 `docker-compose.deploy.yml` 中把目录挂进去（示例思路）：

```yaml
services:
  api:
    volumes:
      - /var/lib/demo2apk/builds:/app/builds
      - /var/lib/demo2apk/uploads:/app/uploads
  worker:
    volumes:
      - /var/lib/demo2apk/builds:/app/builds
      - /var/lib/demo2apk/uploads:/app/uploads
```

> 如果你继续使用 named volume（`builds:`），宿主机 Nginx 也能读，但需要找到 Docker volume 的实际路径，不推荐。

## 4. Nginx 示例（wildcard 子域 -> 静态目录）

> 关键点：**PWA 站点必须是独立子域**，不要用主站同域路径（例如 `/pwa/<id>`）。

```nginx
server {
    listen 80;
    server_name ~^(?<app>[^.]+)\.pwa\.example\.com$;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ~^(?<app>[^.]+)\.pwa\.example\.com$;

    ssl_certificate     /etc/letsencrypt/live/pwa.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pwa.example.com/privkey.pem;

    # 每个发布对应一个目录：/var/lib/demo2apk/pwa-sites/<pwaSiteId>/
    root /var/lib/demo2apk/pwa-sites/$app;
    index index.html;

    # 建议：SW 不要强缓存，避免更新不生效
    location = /service-worker.js {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    location = /manifest.webmanifest {
        default_type application/manifest+json;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 基础安全头（用户内容域建议更严格）
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
}
```

## 4.1 主站/API 与 PWA 域的分离建议

- 主站域（`app.example.com`）不要和发布域（`*.pwa.example.com`）共用同一个 `server_name`/同一个 origin。
- API 建议独立域（`api.example.com`），主站用 `fetch('https://api.example.com/...')`。
- 登录态 cookie 建议 host-only（避免 `Domain=.example.com`），防止 `*.pwa.example.com` 读取/携带主站 cookie。

## 5. 安全建议（做社区/发布时很关键）

- **不要同源**：发布站点必须在独立 origin（最好独立子域；更稳妥是独立根域）。
- **Cookie 不要跨子域**：主站登录 cookie 避免设置 `Domain=.example.com`，尽量用 host-only（或 `__Host-` 前缀）。
- **不要让发布站点能写入主站作用域的 Service Worker**：独立子域天然隔离。
- **构建阶段才是“服务器执行用户代码”的主要风险**：ZIP React 项目会执行 `npm install`/`npm run build`，这会跑用户项目脚本（含 `preinstall/postinstall` 等）。做社区务必考虑：
  - 运行在隔离容器/沙箱（非 root、最小权限、只挂载必要目录）
  - 不要把任何密钥/内网凭证放进构建环境
  - 资源配额（CPU/内存/磁盘），并发限制与限流
  - 网络策略（至少确保不能访问你的内网服务；必要时限制 egress）
  - 日志与审计（谁构建了什么、失败原因、资源占用）

## 6. 限制与运营风险（社区发布必读）

- **这不是“安全审查”**：用户发布的 JS 仍然会在访问者浏览器里执行，可能钓鱼/盗号/诱导下载；隔离 origin 只保证“不污染你的主站”，不能保证“用户站点本身无害”。
- **URL 是否长期有效**：默认会清理过期文件；如果你把它当“正式发布”，需要把 `PWA_RETENTION_HOURS` 调大或做“发布/版本”持久化机制（后续可接社区项目模型）。
- **Service Worker 缓存**：会缓存 `index.html` 与静态资源；线上更新时务必让 `service-worker.js` 不强缓存，并考虑版本化策略（文档示例已加 `no-cache`）。

