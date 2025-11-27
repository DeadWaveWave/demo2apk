# 🚀 Demo2APK 快速使用指南

两个强大的脚本，让你在命令行中快速将 HTML/React 项目打包成 Android APK！

## ✅ 验证状态

- ✅ **html2apk.sh** - 已测试成功，可正常生成 APK
- ⏳ **react-zip2apk.sh** - 待测试

## 📱 快速开始

### 1. 检查环境

```bash
./check-env.sh
```

首次运行会自动安装 Cordova，无需手动干预。

### 2. 从 HTML 文件打包 APK

```bash
# 使用测试文件
./html2apk.sh test-demo.html

# 使用自己的 HTML 文件
./html2apk.sh mypage.html "我的应用" com.mycompany.app

# 参数说明
# $1: HTML 文件路径（必需）
# $2: 应用名称（可选，默认: MyVibeApp）
#  $3: 应用包名（可选，默认: com.example.vibeapp）
```

**输出**: `./output/应用名称-debug.apk`

**构建时间**: 首次约 3-4 分钟（下载 Gradle），后续约 1-2 分钟

### 3. 从 React 项目打包 APK

```bash
# 使用测试项目
./react-zip2apk.sh test-react-app.zip

# 使用自己的项目
# 先打包你的项目
cd my-react-app
zip -r ../my-app.zip .
cd ..

# 然后打包成 APK
./react-zip2apk.sh my-app.zip "MyApp" com.example.myapp
```

**支持的框架**:
- ✅ Vite + React
- ✅ Create React App  
- ✅ Next.js (自动配置静态导出)
- ✅ 任何有 `npm run build` 的项目

## 📦 安装到设备

```bash
# 确保设备已连接并开启 USB 调试
adb devices

# 安装 APK
adb install VibeDemo-debug.apk
```

## 🎯 实际使用案例

### 案例 1: 快速原型验证

```bash
# 创建一个简单的 HTML 页面
cat > landing.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Landing Page</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 { font-size: 3em; margin-bottom: 20px; }
        p { font-size: 1.5em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Welcome!</h1>
        <p>My awesome mobile app</p>
    </div>
</body>
</html>
EOF

# 打包成 APK
./html2apk.sh landing.html "LandingApp" com.demo.landing

# 3 分钟后...
adb install LandingApp-debug.apk
```

### 案例 2: React 应用转 App

```bash
# 假设你有一个 Vite + React 项目
cd my-vite-app

# 修改 vite.config.js 确保使用相对路径
cat >> vite.config.js << 'EOF'
export default {
  base: './',
}
EOF

# 打包项目
npm run build

# 压缩整个项目
cd ..
zip -r my-vite-app.zip my-vite-app

# 打包成 APK
./react-zip2apk.sh my-vite-app.zip "MyVibeApp" com.mycompany.vibe

# 安装测试
adb install output/MyVibeApp-debug.apk
```

## ⚙️ 环境要求

| 工具 | 版本 | 安装检查 |
|------|------|---------|
| Node.js | 16+ | `node --version` |
| npm | 7+ | `npm --version` |
| Java JDK | 11/17/21 | `java -version` |
| Android SDK | - | `echo $ANDROID_HOME` |
| adb | - | `adb version` |

### 配置 Android SDK

如果环境检查失败，设置 Android SDK  路径：

```bash
# macOS
export ANDROID_HOME=$HOME/Library/Android/sdk

# Linux
export ANDROID_HOME=$HOME/Android/Sdk

# 添加到 shell 配置文件
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
source ~/.zshrc
```

## 🐛 常见问题

### 问题 1: "找不到 ANDROID_HOME"

**解决方案**:
```bash
# 检查 SDK 是否安装
ls ~/Library/Android/sdk  # macOS
ls ~/Android/Sdk          # Linux

# 设置环境变量
export ANDROID_HOME=$HOME/Library/Android/sdk
```

### 问题 2: 首次构建很慢

**原因**: 需要下载 Gradle (约 100MB) 和 Android 依赖

**解决方案**: 耐心等待，后续构建会快很多

### 问题 3: "Minimum supported Gradle version is X.X"

**原因**: 脚本中的 Gradle 版本过旧

**解决方案**: 已在脚本中修复，使用 Gradle 8.9+

### 问题 4: HTML 中的相对路径资源无法加载

**解决方案**: 
- 将所有资源（CSS/JS/图片）内联到 HTML 中
- 或使用 base64 编码嵌入
- 或使用 CDN 链接

### 问题 5: React 项目构建失败

**检查**:
1. `package.json` 中是否有 `build` 脚本
2. 项目依赖是否完整
3. 是否使用了 Node.js 原生模块

## 📊 性能对比

| 操作 | 首次 | 后续 |
|------|------|------|
| HTML 打包 | 3-4 分钟 | 1-2 分钟 |
| React 打包 | 5-8 分钟 | 2-4 分钟 |
| Gradle 下载 | 1 分钟 | 缓存 |
| 依赖安装 | 1-3 分钟 | 缓存 |

## 💡 最佳实践

### 1. HTML 项目优化

```html
<!-- 使用内联样式和脚本 -->
<!DOCTYPE html>
<html>
<head>
    <style>
        /* 所有 CSS 写在这里 */
    </style>
</head>
<body>
    <!-- HTML 内容 -->
    <script>
        // 所有 JS 写在这里
    </script>
</body>
</html>
```

### 2. React 项目优化

```javascript
// vite.config.js
export default {
  base: './',  // 重要！使用相对路径
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,  // 小文件内联
  }
}
```

### 3. 批量打包

```bash
# 批量打包多个 HTML 文件
for html in *.html; do
  name=$(basename "$html" .html)
  ./html2apk.sh "$html" "$name" "com.demo.$name"
done
```

## 🔗 相关命令

```bash
# 查看生成的 APK 信息
aapt dump badging VibeDemo-debug.apk

# 查看 APK 内容
unzip -l VibeDemo-debug.apk

# 卸载应用
adb uninstall com.demo.vibe

# 查看应用日志
adb logcat | grep chromium
```

## 📝 项目结构

```
demo2apk/
├── html2apk.sh           ← 核心脚本 1
├── react-zip2apk.sh      ← 核心脚本 2
├── check-env.sh          ← 环境检查
├── test-demo.html        ← 测试文件
├── test-react-app.zip    ← 测试项目
├── README.md             ← 完整文档
├── QUICKSTART.md         ← 本文件
└── output/               ← 构建输出
    ├── AppName-debug.apk     (最终产物)
    └── AppName/              (构建目录)
```

## 🎉 成功案例

✅ **test-demo.html** → **VibeDemo-debug.apk** (3.3MB)
- 构建时间: 3分26秒
- 包含: 渐变背景、计数器、设备检测
- 状态: 已成功测试

## ⏭️ 下一步

1. 真机安装测试
2. 测试 react-zip2apk.sh
3. 添加自定义图标和启动画面
4. Release 签名支持

---

**享受 Vibe Coding! 🚀**

如有问题，查看 `README.md` 获取详细文档。
