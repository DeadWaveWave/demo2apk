# 日志系统使用指南

## 概述

Demo2APK 后端使用结构化日志系统，支持请求追踪和问题排查。

从 v2.2 开始，后端会**自动将结构化日志落地到本地 JSON 行文件（JSONL）**，方便按 `traceId` / `taskId` / 日期做统计分析。

## 日志格式

```
[时间] 级别 消息 | 上下文字段
```

### 示例

```bash
# API 请求日志
[09:15:23.456] INFO  POST /api/build/zip 200 OK (45ms) | trace=abc123 task=xK7m2nP9

# 构建任务日志
[09:15:23.789] INFO  Build task created | trace=abc123 task=xK7m2nP9 app=MyApp type=zip size=2.5 MB

# Worker 构建日志
[09:15:45.123] INFO  Build started | task=xK7m2nP9 app=MyApp type=zip
[09:16:30.456] INFO  Build completed successfully | task=xK7m2nP9 app=MyApp duration=45333ms apkSize=12.5 MB

# 错误日志
[09:15:23.456] WARN  POST /api/build/zip 429 Rate Limited (7ms) | trace=abc123
[09:16:30.456] ERROR Build failed | task=xK7m2nP9 app=MyApp error=Command failed: cordova build
```

### JSON 行（JSONL）格式

后端在运行时会自动写入 `logs/` 目录下的 JSON 行日志文件，例如：

- API 日志：`logs/api-2025-12-08.jsonl`
- Worker 日志：`logs/worker-2025-12-08.jsonl`

每一行都是一个完整的 `LogEntry` 对象，示例：

```json
{
  "timestamp": "2025-12-08T09:16:30.456Z",
  "level": "info",
  "message": "Build completed successfully",
  "context": {
    "component": "worker",
    "taskId": "xK7m2nP9",
    "appName": "MyApp",
    "buildType": "zip",
    "durationMs": 45333,
    "apkSize": 13172736
  }
}
```

> 提示：可以通过环境变量 `LOG_PERSIST_ENABLED=false` 关闭本地 JSONL 落盘，或通过 `LOGS_DIR` 自定义目录（默认是仓库根目录下的 `logs/`）。

## 关键字段说明

| 字段       | 说明                | 用途                         |
| ---------- | ------------------- | ---------------------------- |
| `trace`    | 请求追踪 ID (16位)  | 关联同一 HTTP 请求的所有日志 |
| `task`     | 构建任务 ID (12位)  | 追踪整个构建生命周期         |
| `app`      | 应用名称            | 标识是哪个应用的构建         |
| `type`     | 构建类型 (html/zip) | 区分 HTML 单页或 React 项目  |
| `duration` | 耗时 (毫秒)         | 性能分析                     |
| `size`     | 上传文件大小        | 排查大文件问题               |
| `apkSize`  | 生成 APK 大小       | 验证构建结果                 |

## 使用 traceId 排查问题

### 场景 1：用户报告构建失败

1. **获取 traceId**：从用户的错误响应或前端日志中获取 `traceId`

2. **搜索相关日志**：
   ```bash
   # 搜索该请求的所有日志
   grep "trace=abc123" logs/api.log
   
   # 或使用 jq 处理 JSON 日志
   cat logs/api.log | jq 'select(.trace == "abc123")'
   ```

3. **找到 taskId**：从日志中找到 `task=xK7m2nP9`

4. **追踪构建过程**：
   ```bash
   # 从 JSONL 中搜索该任务的 Worker 日志
   cat logs/worker-*.jsonl | jq 'select(.context.taskId == "xK7m2nP9")'
   ```

### 场景 2：排查 429 限流问题

```bash
# 查看某 IP 的请求频率
grep "ip=192.168.1.100" logs/api.log | grep "429"

# 统计限流次数
grep "429 Rate Limited" logs/api.log | wc -l
```

### 场景 3：性能分析

```bash
# 找出耗时超过 60 秒的构建
cat logs/worker-*.jsonl | jq 'select(.message == "Build completed successfully" and .context.durationMs > 60000)'

# 统计平均构建时间（简单示例，实际建议使用内置脚本）
cat logs/worker-*.jsonl | jq 'select(.message == "Build completed successfully") | .context.durationMs'
```

## 基于 JSONL 的统计脚本

在 backend 包中内置了一个日志统计脚本，默认从 `logs/worker-*.jsonl` 中读取 Worker 的构建结果日志。

### 安装依赖 / 构建

```bash
pnpm install
pnpm --filter @demo2apk/backend build
```

### 使用示例

#### 在项目根目录使用封装命令（推荐）

```bash
# 按当天日期输出详细报告（总次数 / 唯一项目数 / 每日汇总 / 时间线）
pnpm log:stats -- --date=2025-12-08

# 按日期区间输出详细报告
pnpm log:stats -- --from=2025-12-01 --to=2025-12-07

# 按构建类型统计（html / zip / html-project 各有多少次构建、多少应用）
pnpm log:stats:types -- --date=2025-12-08

# 按项目名称统计（每个 app 构建次数、成功率等）
pnpm log:stats:apps -- --date=2025-12-08
```

#### 在 Docker 部署环境中使用

假设你在服务器上的部署目录为 `~/demo2apk`，其中包含 `docker-compose.deploy.yml`，并且该文件中已经挂载了日志目录：

```yaml
services:
  api:
    volumes:
      - ./logs:/app/logs
  worker:
    volumes:
      - ./logs:/app/logs
```

此时可以直接在容器内运行统计脚本：

```bash
cd ~/demo2apk

# 当天详细报告（总数 / 唯一项目数 / 每日汇总 / 时间线）
docker compose -f docker-compose.deploy.yml run --rm api \
  node packages/backend/dist/scripts/logStats.js --date=2025-12-08

# 按类型统计
docker compose -f docker-compose.deploy.yml run --rm api \
  node packages/backend/dist/scripts/logStats.js --types --date=2025-12-08

# 按项目名称统计
docker compose -f docker-compose.deploy.yml run --rm api \
  node packages/backend/dist/scripts/logStats.js --apps --date=2025-12-08

# 输出 JSON（方便用 jq 做进一步分析）
docker compose -f docker-compose.deploy.yml run --rm api \
  node packages/backend/dist/scripts/logStats.js --json --date=2025-12-08
```

#### 直接调用 backend 包的脚本（等价用法）

```bash
# 详细报告（等价于 pnpm log:stats）
pnpm --filter @demo2apk/backend log:stats --date=2025-12-08

# 只看按类型汇总
pnpm --filter @demo2apk/backend log:stats -- --types --date=2025-12-08

# 只看按项目汇总
pnpm --filter @demo2apk/backend log:stats -- --apps --date=2025-12-08

# 输出 JSON（方便用 jq 二次处理，包含 summaries / records / byApp / byBuildType）
pnpm --filter @demo2apk/backend log:stats --date=2025-12-08 --json
```

> 参数说明：  
> - `--date=YYYY-MM-DD`：只统计某一天  
> - `--from=YYYY-MM-DD --to=YYYY-MM-DD`：统计一段时间  
> - `--json`：输出 JSON  
> - `--types`：按构建类型汇总  
> - `--apps`：按项目名称汇总

#### 输出示例（详细报告）

```text
Total builds: 478

Unique project names: 298

Daily counts:
  2025-12-06: 231
  2025-12-07: 168
  2025-12-08: 79

Timeline:
  2025-12-06 13:54:23 CST | smartflow | zip
  2025-12-06 13:56:29 CST | index | html
  2025-12-06 14:02:12 CST | copy-of-smartrollcall (3) | zip
  ...
```

#### 输出示例（按类型汇总）

```text
Builds by type:
  html: total=120 success=115 failed=5 successRate=95.8% uniqueApps=80 avgDuration=32000ms
  zip: total=358 success=340 failed=18 successRate=95.0% uniqueApps=218 avgDuration=87000ms
```

## 日志级别

| 级别    | 用途                       | 示例               |
| ------- | -------------------------- | ------------------ |
| `DEBUG` | 调试信息，生产环境默认关闭 | 构建进度更新       |
| `INFO`  | 正常操作记录               | 请求完成、构建成功 |
| `WARN`  | 警告，不影响运行           | 限流、文件不存在   |
| `ERROR` | 错误，需要关注             | 构建失败、系统异常 |

### 调整日志级别

```bash
# 环境变量控制
LOG_LEVEL=debug pnpm dev  # 显示所有日志
LOG_LEVEL=warn pnpm start # 只显示警告和错误
```

## 日志流转图

```
用户请求
    │
    ▼
┌─────────────────────────────────────┐
│ API Server                          │
│ trace=abc123                        │
│ ├─ POST /api/build/zip 200 (45ms)  │
│ └─ Build task created task=xK7m2nP9│
└─────────────────────────────────────┘
    │
    ▼ (Redis Queue)
    │
┌─────────────────────────────────────┐
│ Worker                              │
│ task=xK7m2nP9                       │
│ ├─ Build started                    │
│ ├─ Build progress: 50%              │
│ └─ Build completed (45333ms)        │
└─────────────────────────────────────┘
```

## 生产环境建议

### 1. 日志收集

将日志输出到文件或日志收集服务：

> 从 v2.2 开始，推荐优先使用内置的 JSONL 落盘（`logs/api-*.jsonl` / `logs/worker-*.jsonl`），
> 再视情况接入 ELK / Loki 等日志系统。

### 2. 日志轮转

使用 `logrotate` 避免日志文件过大：

```
/path/to/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

### 3. 结构化日志查询

如果使用 ELK/Loki 等日志系统，可以：

```
# Kibana 查询示例
trace: "abc123" AND level: "ERROR"

# Loki LogQL
{app="demo2apk"} |= "task=xK7m2nP9"
```

## 常见问题排查清单

| 问题          | 排查步骤                                                           |
| ------------- | ------------------------------------------------------------------ |
| 构建超时      | 1. 搜索 taskId → 2. 查看最后一条进度日志 → 3. 检查是否有错误       |
| 限流频繁      | 1. 统计 429 日志 → 2. 按 IP 分组 → 3. 调整限流配置                 |
| APK 下载 404  | 1. 搜索 taskId → 2. 确认构建是否成功 → 3. 检查文件清理日志         |
| Worker 无响应 | 1. 检查 Worker 启动日志 → 2. 查看 Redis 连接状态 → 3. 检查错误日志 |

