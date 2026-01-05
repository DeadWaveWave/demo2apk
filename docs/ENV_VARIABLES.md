# 环境变量默认值对照表

本文档列出了 Demo2APK 2.3.0 版本中所有环境变量的默认值和配置位置。

## 📋 环境变量默认值总览

| 环境变量 | docker-compose 默认值 | 代码默认值 | 说明 |
|---------|---------------------|-----------|------|
| **基础配置** |
| `FRONTEND_PORT` | `80` | - | 前端 Web UI 端口 |
| `API_PORT` | `3000` | - | API 服务器端口 |
| `NODE_ENV` | `production` | - | 运行环境 |
| **存储配置** |
| `BUILDS_DIR` | `/app/builds` | `./builds` | APK 构建输出目录 |
| `UPLOADS_DIR` | `/app/uploads` | `os.tmpdir()/demo2apk-uploads` | 上传文件临时目录 |
| `LOGS_DIR` | `/app/logs` | `./logs` | 结构化日志目录 |
| **文件管理** |
| `MAX_FILE_SIZE` | `52428800` (50MB) | `52428800` | 最大上传文件大小 |
| `FILE_RETENTION_HOURS` | `2` | `2` | APK 文件保留时间（小时） |
| **限流配置** |
| `RATE_LIMIT_ENABLED` | `true` | `true` | 是否启用限流 |
| `RATE_LIMIT_MAX` | `5` | `5` | 每个时间窗口最大请求数 |
| `RATE_LIMIT_WINDOW` | `1 hour` | `1 hour` | 限流时间窗口 |
| **构建清理** |
| `CLEANUP_BUILD_ARTIFACTS` | `true` | `true` | 构建后是否删除 Cordova/Capacitor 工作目录 |
| `CLEANUP_UPLOADS_ON_COMPLETE` | - | `true` (默认) | 任务完成后是否删除上传文件 |
| **定期清理** |
| `FILE_CLEANUP_ENABLED` | `true` | `true` (默认) | 是否启用定期清理过期文件 |
| `FILE_CLEANUP_INTERVAL_MINUTES` | `30` | `30` | 清理扫描间隔（分钟） |
| **Worker 配置** |
| `WORKER_CONCURRENCY` | `1` | `2` | 并发构建任务数 |
| `MOCK_BUILD` | `false` | `false` | 是否使用模拟构建（测试用） |
| **PWA 支持 (v2.3.0 新增)** |
| `PWA_ENABLED` | `false` | `false` | 是否启用 PWA 导出功能 |
| `PWA_DIR` | `/app/builds/pwa-sites` | `{BUILDS_DIR}/pwa-sites` | PWA 站点存储目录 |
| `PWA_HOST_SUFFIX` | `""` (空) | - | PWA 域名后缀（可选） |
| `PWA_URL_SCHEME` | `https` | `https` | PWA URL 协议 |
| `PWA_RETENTION_HOURS` | `""` (继承 FILE_RETENTION_HOURS) | 继承 `FILE_RETENTION_HOURS` | PWA 文件保留时间 |
| **资源限制** |
| `API_MEMORY_LIMIT` | `2G` | - | API 服务器内存限制 |
| `API_CPU_LIMIT` | `2` | - | API 服务器 CPU 限制 |
| `WORKER_MEMORY_LIMIT` | `2G` | - | Worker 内存限制 |
| `WORKER_MEMORY_MB` | `2048` | - | Worker 内存限制（MB） |
| `WORKER_CPU_LIMIT` | `2` | - | Worker CPU 限制 |

## 🔍 重要说明

### 1. CLEANUP_BUILD_ARTIFACTS
- **docker-compose 默认值**: `true`
- **代码默认值**: `true` (未设置时)
- **作用**: 控制是否在构建完成后删除 Cordova/Capacitor 临时工作目录
- **保留内容**: APK 文件始终保留，只删除中间构建产物
- **关闭方式**: 设为 `false`, `0`, `no`, `off` 均可

### 2. FILE_CLEANUP_ENABLED
- **docker-compose 默认值**: `true`
- **代码默认值**: `true` (使用 `!== 'false'` 判断)
- **作用**: 控制 Worker 是否定期扫描并删除过期文件
- **扫描目标**: `BUILDS_DIR` 和 `UPLOADS_DIR` 中超过 `FILE_RETENTION_HOURS` 的文件
- **关闭方式**: 必须显式设为 `false`

### 3. CLEANUP_UPLOADS_ON_COMPLETE
- **docker-compose**: 未在 docker-compose.deploy.yml 中配置
- **代码默认值**: `true` (使用 `!== 'false'` 判断)
- **作用**: 任务完成后立即删除上传的源文件
- **关闭方式**: 必须显式设为 `false`

### 4. PWA_ENABLED
- **docker-compose 默认值**: `false`
- **代码默认值**: `false` (使用 `=== 'true'` 判断)
- **作用**: 是否允许用户在构建时选择导出 PWA
- **启用方式**: 必须显式设为 `true`

### 5. PWA_RETENTION_HOURS
- **docker-compose 默认值**: `""` (空字符串)
- **代码默认值**: 继承 `FILE_RETENTION_HOURS` 的值
- **作用**: PWA 站点的保留时间，默认与 APK 相同

## 📝 配置建议

### 生产环境推荐配置
```bash
# 使用默认值即可，无需额外配置
CLEANUP_BUILD_ARTIFACTS=true
FILE_CLEANUP_ENABLED=true
FILE_CLEANUP_INTERVAL_MINUTES=30
FILE_RETENTION_HOURS=2
PWA_ENABLED=false
```

### 开发/调试环境
```bash
# 保留构建产物以便检查
CLEANUP_BUILD_ARTIFACTS=false
FILE_CLEANUP_ENABLED=false
MOCK_BUILD=true
```

### 启用 PWA 功能
```bash
PWA_ENABLED=true
PWA_HOST_SUFFIX=pwa.yourdomain.com
PWA_RETENTION_HOURS=24  # 可选，PWA 保留更长时间
```

## ⚠️ 注意事项

1. **布尔值判断差异**:
   - `CLEANUP_BUILD_ARTIFACTS`: 默认 `true`，只有明确设为 `false/0/no/off` 才关闭
   - `FILE_CLEANUP_ENABLED`: 默认 `true`，只有设为 `false` 才关闭
   - `PWA_ENABLED`: 默认 `false`，只有设为 `true` 才启用

2. **docker-compose.deploy.yml 中的默认值**:
   - 使用 `${VAR:-default}` 语法提供默认值
   - 如果不设置 `.env` 文件，会使用这些默认值
   - 所有默认值都是生产环境推荐配置

3. **新增变量的兼容性**:
   - 所有 2.3.0 新增的环境变量都有合理的默认值
   - 无需修改配置即可升级到 2.3.0
   - PWA 功能默认关闭，不影响现有部署
