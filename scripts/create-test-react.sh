#!/usr/bin/env bash

# 创建测试用 React 项目的脚本
set -e

echo "正在创建测试 React 项目..."

# 创建临时目录
TEMP_DIR="test-react-app"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

cd "$TEMP_DIR"

# 创建 package.json
cat > package.json << 'EOF'
{
  "name": "test-react-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8"
  }
}
EOF

# 创建 vite.config.js
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
})
EOF

# 创建 index.html
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Test App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# 创建 src 目录
mkdir -p src

# 创建 src/main.jsx
cat > src/main.jsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# 创建 src/App.jsx
cat > src/App.jsx << 'EOF'
import React, { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [time, setTime] = useState(new Date())
  const [device, setDevice] = useState('检测中...')

  useEffect(() => {
    // 检测设备
    const ua = navigator.userAgent
    let deviceType = 'Desktop'
    
    if (/Android/i.test(ua)) {
      deviceType = 'Android'
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      deviceType = 'iOS'
    }
    
    setDevice(deviceType)

    // 更新时间
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="app">
      <div className="container">
        <h1>🚀 React Vibe App</h1>
        <p className="subtitle">使用 React + Vite 构建</p>
        
        <div className="counter-section">
          <div className="counter">{count}</div>
          <button 
            className="button" 
            onClick={() => setCount(count + 1)}
          >
            点击计数 +1
          </button>
          <button 
            className="button secondary" 
            onClick={() => setCount(0)}
          >
            重置
          </button>
        </div>

        <div className="info-card">
          <div className="info-item">
            <span className="icon">📱</span>
            <strong>设备:</strong> {device}
          </div>
          <div className="info-item">
            <span className="icon">⏰</span>
            <strong>时间:</strong> {time.toLocaleTimeString('zh-CN')}
          </div>
          <div className="info-item">
            <span className="icon">⚛️</span>
            <strong>框架:</strong> React {React.version}
          </div>
        </div>

        <div className="features">
          <div className="feature">
            <div className="feature-icon">⚡</div>
            <div className="feature-title">快速构建</div>
            <div className="feature-desc">使用 Vite 实现极速热更新</div>
          </div>
          <div className="feature">
            <div className="feature-icon">📦</div>
            <div className="feature-title">一键打包</div>
            <div className="feature-desc">轻松打包成 Android APK</div>
          </div>
          <div className="feature">
            <div className="feature-icon">🎨</div>
            <div className="feature-title">现代设计</div>
            <div className="feature-desc">精美的渐变和动画效果</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
EOF

# 创建 src/index.css
cat > src/index.css << 'EOF'
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
    'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
EOF

# 创建 src/App.css
cat > src/App.css << 'EOF'
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.container {
  max-width: 800px;
  width: 100%;
  animation: fadeIn 1s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

h1 {
  color: white;
  font-size: 3em;
  text-align: center;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 1.2em;
  margin-bottom: 40px;
}

.counter-section {
  text-align: center;
  margin-bottom: 40px;
}

.counter {
  font-size: 5em;
  font-weight: bold;
  color: white;
  margin: 30px 0;
  text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.counter:active {
  transform: scale(1.1);
}

.button {
  background: white;
  color: #667eea;
  border: none;
  padding: 15px 40px;
  font-size: 1.1em;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  font-weight: bold;
  margin: 0 10px;
}

.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.button:active {
  transform: translateY(0);
}

.button.secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  backdrop-filter: blur(10px);
}

.info-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 30px;
  margin: 30px 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.info-item {
  color: white;
  margin: 15px 0;
  font-size: 1.1em;
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon {
  font-size: 1.5em;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 40px;
}

.feature {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  text-align: center;
  transition: transform 0.3s ease;
}

.feature:hover {
  transform: translateY(-5px);
}

.feature-icon {
  font-size: 3em;
  margin-bottom: 15px;
}

.feature-title {
  color: white;
  font-size: 1.3em;
  font-weight: bold;
  margin-bottom: 10px;
}

.feature-desc {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9em;
  line-height: 1.5;
}

@media (max-width: 768px) {
  h1 {
    font-size: 2em;
  }
  
  .counter {
    font-size: 3em;
  }
  
  .button {
    padding: 12px 30px;
    font-size: 1em;
    margin: 5px;
  }
  
  .features {
    grid-template-columns: 1fr;
  }
}
EOF

cd ..

# 打包成 zip
echo "正在打包成 ZIP..."
zip -r test-react-app.zip test-react-app

echo "✓ 测试 React 项目已创建并打包: test-react-app.zip"
echo "✓ 项目目录: test-react-app/"
