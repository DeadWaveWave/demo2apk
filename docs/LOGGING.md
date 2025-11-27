# 日志系统使用指南

## 概述

Demo2APK 后端使用结构化日志系统，支持请求追踪和问题排查。

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
   # 搜索该任务的 Worker 日志
   grep "task=xK7m2nP9" logs/worker.log
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
grep "Build completed" logs/worker.log | grep -E "duration=[6-9][0-9]{4}|duration=[0-9]{6}"

# 统计平均构建时间（需要进一步处理）
grep "Build completed successfully" logs/worker.log
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

```bash
# 输出到文件
pnpm start 2>&1 | tee -a logs/api.log

# 或使用 PM2
pm2 start dist/index.js --log logs/api.log
```

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

