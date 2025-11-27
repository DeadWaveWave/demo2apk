# React 项目打包要求

本文档说明将 React 项目打包成 Android APK 时的代码要求和常见问题解决方案。

## 问题背景

### 症状
- APK 安装后打开是**白屏/空白页面**
- 控制台无明显错误（或显示模块加载错误）

### 根本原因

Android WebView（特别是旧版本）对 **ES Modules** 的支持不完整。

默认情况下，Vite 构建的代码使用 ES Modules 格式：

```html
<!-- ❌ 问题代码 - 旧版 WebView 不支持 -->
<script type="module" src="./assets/index.js"></script>
```

旧版 Android WebView（Android 6-8，Chrome 61 以下）遇到 `type="module"` 时会：
- 完全忽略该脚本
- 不执行任何 JavaScript
- 导致页面白屏

## 解决方案

### 方案一：使用 @vitejs/plugin-legacy（推荐）

安装 legacy 插件，同时生成现代版和兼容版代码：

```bash
npm install -D @vitejs/plugin-legacy terser
```

更新 `vite.config.js`：

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 52', 'android >= 5'],
      renderLegacyChunks: true,
      modernPolyfills: true,
    })
  ],
  base: './',  // 重要：使用相对路径
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
  }
})
```

构建后会生成两套代码：

```html
<!-- 现代浏览器使用 -->
<script type="module" src="./assets/index-modern.js"></script>

<!-- 旧版浏览器使用 (nomodule) -->
<script nomodule src="./assets/polyfills-legacy.js"></script>
<script nomodule src="./assets/index-legacy.js"></script>
```

### 方案二：配置构建目标为 ES2015

如果不想添加 legacy 插件，至少确保目标是 ES2015：

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2015',  // 不要使用 'esnext' 或 'es2020'
  }
})
```

## 必需的配置

### 1. 使用相对路径 (`base: './'`)

```javascript
// ✅ 正确
export default defineConfig({
  base: './',
})

// ❌ 错误 - 在 APK 中无法访问根路径
export default defineConfig({
  base: '/',
})
```

### 2. 确保有 index.html 入口

项目根目录必须有 `index.html` 文件。

### 3. package.json 必需字段

```json
{
  "name": "your-app",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

## 常见问题排查

### 问题 1：白屏

| 可能原因          | 解决方案                      |
| ----------------- | ----------------------------- |
| ES Modules 不兼容 | 添加 `@vitejs/plugin-legacy`  |
| 路径错误          | 设置 `base: './'`             |
| 构建失败          | 检查 `npm run build` 是否成功 |

### 问题 2：资源加载失败

| 可能原因  | 解决方案                                     |
| --------- | -------------------------------------------- |
| 绝对路径  | 所有资源使用相对路径                         |
| CORS 错误 | 移除 `crossorigin` 属性（legacy 插件会处理） |

### 问题 3：CSS 不生效

| 可能原因         | 解决方案                     |
| ---------------- | ---------------------------- |
| CSS 动态加载失败 | 设置 `cssTarget: 'chrome61'` |

## 项目结构示例

```
my-react-app/
├── index.html          # 入口 HTML
├── package.json        # 依赖配置
├── vite.config.js      # Vite 配置（包含 legacy 插件）
├── src/
│   ├── main.jsx        # React 入口
│   ├── App.jsx         # 主组件
│   └── App.css         # 样式
└── public/             # 静态资源（可选）
    └── favicon.ico
```

## 完整的 vite.config.js 模板

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    // 生成兼容旧版 Android WebView 的代码
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 52', 'android >= 5'],
      renderLegacyChunks: true,
      modernPolyfills: true,
    })
  ],
  
  // 使用相对路径（APK 必需）
  base: './',
  
  build: {
    // 目标 ES2015 以获得最大兼容性
    target: 'es2015',
    cssTarget: 'chrome61',
    
    // 可选：优化输出
    minify: 'terser',
    sourcemap: false,
  },
})
```

## 测试建议

1. **本地测试**：`npm run build && npm run preview`
2. **构建前检查**：确保 `npm run build` 无错误
3. **APK 测试**：在 Android 6.0+ 设备上测试

## 支持的框架

| 框架             | 支持状态   | 备注                              |
| ---------------- | ---------- | --------------------------------- |
| Vite + React     | ✅ 完全支持 | 推荐使用 legacy 插件              |
| Create React App | ✅ 支持     | 默认兼容性较好                    |
| Next.js          | ⚠️ 需配置   | 需要静态导出 (`output: 'export'`) |
| Vue + Vite       | ✅ 支持     | 同样需要 legacy 插件              |

## 对比：修复前 vs 修复后

### 修复前（白屏）

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: './',
})
```

生成的 HTML：
```html
<script type="module" src="./assets/index.js"></script>
<!-- 旧版 WebView 完全忽略此脚本 -->
```

### 修复后（正常显示）

```javascript
// vite.config.js
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 52', 'android >= 5'] })
  ],
  base: './',
})
```

生成的 HTML：
```html
<!-- 现代浏览器 -->
<script type="module" src="./assets/index.js"></script>

<!-- 旧版浏览器降级 -->
<script nomodule src="./assets/polyfills-legacy.js"></script>
<script nomodule src="./assets/index-legacy.js"></script>
```

---

## 总结

| 必做项                       | 原因                     |
| ---------------------------- | ------------------------ |
| 添加 `@vitejs/plugin-legacy` | 兼容旧版 Android WebView |
| 设置 `base: './'`            | APK 中使用相对路径       |
| 设置 `target: 'es2015'`      | 避免使用过新的 JS 特性   |

遵循以上要求，可以确保 React 项目在 Android 5.0+ 设备上正常运行。

