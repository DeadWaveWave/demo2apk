# Demo2APK API 文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `multipart/form-data` (上传) / `application/json` (响应)

## 端点概览

| 方法   | 端点                          | 描述                   |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/health`                     | 服务健康检查           |
| POST   | `/api/build/html`             | 上传 HTML 文件构建 APK |
| POST   | `/api/build/zip`              | 上传 ZIP 项目构建 APK  |
| GET    | `/api/build/:taskId/status`   | 查询任务状态           |
| GET    | `/api/build/:taskId/download` | 下载构建完成的 APK     |
| DELETE | `/api/build/:taskId`          | 取消任务并清理文件     |

## 详细说明

### 1. 健康检查

```bash
GET /health
```

响应:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. HTML 构建

```bash
POST /api/build/html
```

**参数:**

| 字段    | 类型   | 必填 | 说明                        |
| ------- | ------ | ---- | --------------------------- |
| file    | File   | 是   | HTML 文件 (.html/.htm)      |
| appName | string | 否   | 应用名称 (默认 "MyVibeApp") |
| appId   | string | 否   | 包名 (自动生成)             |

**示例:**

```bash
curl -X POST http://localhost:3000/api/build/html \
  -F "file=@mypage.html" \
  -F "appName=MyApp"
```

### 3. ZIP/React 构建

```bash
POST /api/build/zip
```

**参数:**

| 字段    | 类型   | 必填 | 说明                               |
| ------- | ------ | ---- | ---------------------------------- |
| file    | File   | 是   | 项目 ZIP 包                        |
| appName | string | 否   | 应用名称 (默认 "MyReactApp")       |
| appId   | string | 否   | 包名 (默认 "com.example.reactapp") |

**支持项目:**
- Vite + React
- Create React App
- Next.js (静态导出)

### 4. 查询状态

```bash
GET /api/build/:taskId/status
```

**状态值:**
- `pending`: 等待中
- `active`: 构建中
- `completed`: 完成
- `failed`: 失败

**响应示例:**

```json
{
  "taskId": "abc123xyz",
  "status": "active",
  "progress": {
    "message": "Building APK...",
    "percent": 70
  }
}
```

### 5. 下载 APK

```bash
GET /api/build/:taskId/download
```

返回 APK 文件流。

### 6. 删除任务

```bash
DELETE /api/build/:taskId
```

清理任务记录和相关临时文件。

