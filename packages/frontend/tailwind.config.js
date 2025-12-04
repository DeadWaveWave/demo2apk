/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bp-dark': '#050b14',      // 深蓝黑底色
        'bp-panel': '#0a1625',     // 面板背景
        'bp-grid': '#1a2634',      // 网格线
        'bp-blue': '#00f0ff',      // 核心工程蓝
        'bp-cyan': '#00ff9d',      // 成功/数据流
        'bp-alert': '#ff9900',     // 警示
        'bp-warning': '#ffcc00',   // 排队等待（黄色）
        'bp-text': '#e0f7ff',      // 主要文字（偏冷白）
        'bp-dim': '#5c7c8a',       // 次要文字
      },
      fontFamily: {
        'tech': ['"Share Tech Mono"', 'monospace'],
        'mono': ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'blueprint-grid': `
          linear-gradient(to right, rgba(26, 38, 52, 0.5) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(26, 38, 52, 0.5) 1px, transparent 1px)
        `,
        'blueprint-grid-lg': `
          linear-gradient(to right, rgba(0, 240, 255, 0.1) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0, 240, 255, 0.1) 1px, transparent 1px)
        `,
      },
      boxShadow: {
        'glow-blue': '0 0 10px rgba(0, 240, 255, 0.3), 0 0 20px rgba(0, 240, 255, 0.1)',
        'glow-cyan': '0 0 10px rgba(0, 255, 157, 0.3), 0 0 20px rgba(0, 255, 157, 0.1)',
      },
      animation: {
        'scanline': 'scanline 4s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        }
      }
    },
  },
  plugins: [],
}
