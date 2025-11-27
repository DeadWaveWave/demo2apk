#!/usr/bin/env bash

###############################################################################
# react-zip2apk.sh - 从 React 项目 ZIP 包打包成 Android APK
# 使用 Capacitor + Gradle 实现
# 
# 用法:
#   ./react-zip2apk.sh <project.zip> [app-name] [app-id]
#
# 示例:
#   ./react-zip2apk.sh my-react-app.zip MyApp com.example.myapp
#
# 输出:
#   生成的 APK 在 ./output/<app-name>-debug.apk
###############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}==>${NC} $1\n"
}

###############################################################################
# 1. 检查参数
###############################################################################

if [ -z "$1" ]; then
    print_error "缺少 ZIP 文件参数"
    echo ""
    echo "用法: $0 <project.zip> [app-name] [app-id]"
    echo ""
    echo "示例:"
    echo "  $0 my-react-app.zip"
    echo "  $0 my-react-app.zip MyApp com.example.myapp"
    exit 1
fi

ZIP_FILE="$1"
APP_NAME="${2:-MyReactApp}"
APP_ID="${3:-com.example.reactapp}"

# 检查 ZIP 文件是否存在
if [ ! -f "$ZIP_FILE" ]; then
    print_error "ZIP 文件不存在: $ZIP_FILE"
    exit 1
fi

print_step "配置信息"
print_info "ZIP 文件: $ZIP_FILE"
print_info "应用名称: $APP_NAME"
print_info "应用 ID: $APP_ID"

###############################################################################
# 2. 检查环境依赖
###############################################################################

print_step "检查环境依赖"

# 检查 unzip
if ! command -v unzip &> /dev/null; then
    print_error "未安装 unzip 工具"
    exit 1
fi
print_success "unzip 已安装"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    print_error "未安装 Node.js，请先安装: https://nodejs.org/"
    exit 1
fi
print_success "Node.js $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    print_error "未安装 npm"
    exit 1
fi
print_success "npm $(npm --version)"

# 检查 Java
if ! command -v java &> /dev/null; then
    print_error "未安装 Java JDK，请先安装 JDK 11 或 17"
    exit 1
fi
print_success "Java $(java -version 2>&1 | head -n 1)"

# 检查 ANDROID_HOME
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    print_warning "未设置 ANDROID_HOME 或 ANDROID_SDK_ROOT 环境变量"
    print_info "尝试自动检测 Android SDK..."
    
    # 常见路径
    POSSIBLE_PATHS=(
        "$HOME/Android/Sdk"
        "$HOME/Library/Android/sdk"
        "/opt/android-sdk"
    )
    
    for path in "${POSSIBLE_PATHS[@]}"; do
        if [ -d "$path" ]; then
            export ANDROID_HOME="$path"
            export ANDROID_SDK_ROOT="$path"
            print_success "找到 Android SDK: $path"
            break
        fi
    done
    
    if [ -z "$ANDROID_HOME" ]; then
        print_error "无法找到 Android SDK，请安装并设置 ANDROID_HOME"
        exit 1
    fi
else
    # 如果只设置了其中一个，确保两个都设置
    if [ -z "$ANDROID_HOME" ]; then
        export ANDROID_HOME="$ANDROID_SDK_ROOT"
        print_info "从 ANDROID_SDK_ROOT 设置 ANDROID_HOME"
    fi
    if [ -z "$ANDROID_SDK_ROOT" ]; then
        export ANDROID_SDK_ROOT="$ANDROID_HOME"
        print_info "从 ANDROID_HOME 设置 ANDROID_SDK_ROOT"
    fi
fi

print_success "Android SDK: $ANDROID_HOME"

###############################################################################
# 3. 解压 ZIP 文件
###############################################################################

print_step "解压 React 项目"

WORK_DIR="./output/${APP_NAME}-build"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

# 获取 ZIP 文件的绝对路径
ZIP_FILE_ABS="$(cd "$(dirname "$ZIP_FILE")" && pwd)/$(basename "$ZIP_FILE")"

cd "$WORK_DIR"
unzip -q "$ZIP_FILE_ABS"

# 检测实际的项目根目录（可能在子目录中）
PROJECT_ROOT="."
if [ ! -f "package.json" ]; then
    # 查找第一个包含 package.json 的目录
    FOUND_DIR=$(find . -name "package.json" -type f | head -1 | xargs dirname)
    if [ -n "$FOUND_DIR" ]; then
        PROJECT_ROOT="$FOUND_DIR"
        print_info "检测到项目根目录: $PROJECT_ROOT"
        cd "$PROJECT_ROOT"
    else
        print_error "未找到 package.json，这不是一个有效的 Node.js 项目"
        exit 1
    fi
fi

print_success "项目已解压"

###############################################################################
# 4. 安装依赖
###############################################################################

print_step "安装项目依赖"

# 检测使用的包管理器
if [ -f "pnpm-lock.yaml" ]; then
    PKG_MANAGER="pnpm"
    if ! command -v pnpm &> /dev/null; then
        print_warning "检测到 pnpm-lock.yaml 但未安装 pnpm，使用 npm 代替"
        PKG_MANAGER="npm"
    fi
elif [ -f "yarn.lock" ]; then
    PKG_MANAGER="yarn"
    if ! command -v yarn &> /dev/null; then
        print_warning "检测到 yarn.lock 但未安装 yarn，使用 npm 代替"
        PKG_MANAGER="npm"
    fi
else
    PKG_MANAGER="npm"
fi

print_info "使用包管理器: $PKG_MANAGER"

$PKG_MANAGER install

print_success "依赖安装完成"

###############################################################################
# 5. 检测构建配置
###############################################################################

print_step "分析项目配置"

# 检测构建输出目录
BUILD_DIR="dist"
if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then
    print_info "检测到 Vite 项目"
    BUILD_COMMAND="build"
    BUILD_DIR="dist"
elif [ -f "next.config.js" ] || [ -f "next.config.ts" ]; then
    print_info "检测到 Next.js 项目"
    BUILD_COMMAND="build"
    BUILD_DIR="out"
    # 确保 Next.js 配置了静态导出
    if ! grep -q "output.*export" next.config.* 2>/dev/null; then
        print_warning "Next.js 项目需要静态导出配置"
        # 创建或修改配置
        cat > next.config.override.js << 'EOF'
const nextConfig = {
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
}
module.exports = nextConfig
EOF
        mv next.config.override.js next.config.js
        print_info "已自动配置静态导出"
    fi
elif grep -q "react-scripts" package.json 2>/dev/null; then
    print_info "检测到 Create React App 项目"
    BUILD_COMMAND="build"
    BUILD_DIR="build"
else
    print_warning "未识别到特定框架，使用默认构建命令"
    BUILD_COMMAND="build"
    # 尝试从 package.json 读取
    if grep -q '"build"' package.json; then
        print_info "找到 build 脚本"
    else
        print_error "package.json 中未找到 build 脚本"
        exit 1
    fi
fi

print_info "构建命令: $PKG_MANAGER run $BUILD_COMMAND"
print_info "输出目录: $BUILD_DIR"

###############################################################################
# 6. 构建 React 项目
###############################################################################

print_step "构建 React 项目"

$PKG_MANAGER run $BUILD_COMMAND

if [ ! -d "$BUILD_DIR" ]; then
    print_error "构建输出目录不存在: $BUILD_DIR"
    print_info "尝试查找可能的输出目录..."
    ls -la
    exit 1
fi

print_success "React 项目构建完成"

###############################################################################
# 7. 安装 Capacitor
###############################################################################

print_step "安装 Capacitor"

$PKG_MANAGER install @capacitor/core @capacitor/cli @capacitor/android

print_success "Capacitor 安装完成"

###############################################################################
# 8. 初始化 Capacitor
###############################################################################

print_step "初始化 Capacitor"

# 创建 Capacitor 配置
cat > capacitor.config.ts << EOF
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '$APP_ID',
  appName: '$APP_NAME',
  webDir: '$BUILD_DIR',
  bundledWebRuntime: false,
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config;
EOF

print_success "Capacitor 配置完成"

###############################################################################
# 9. 添加 Android 平台
###############################################################################

print_step "添加 Android 平台"

npx cap add android

print_success "Android 平台添加完成"

###############################################################################
# 10. 同步 Web 资源
###############################################################################

print_step "同步 Web 资源到 Android"

npx cap sync android

print_success "资源同步完成"

###############################################################################
# 11. 构建 Debug APK
###############################################################################

print_step "构建 Debug APK"

cd android

# 给 gradlew 执行权限
chmod +x gradlew

# 构建 Debug APK
./gradlew assembleDebug --no-daemon

print_success "APK 构建完成"

###############################################################################
# 12. 查找并复制 APK
###############################################################################

print_step "导出 APK"

APK_SOURCE="app/build/outputs/apk/debug/app-debug.apk"

if [ ! -f "$APK_SOURCE" ]; then
    print_error "未找到生成的 APK: $APK_SOURCE"
    exit 1
fi

# 回到输出目录的上层
cd ../../..
APK_OUTPUT="./output/${APP_NAME}-debug.apk"
cp "$WORK_DIR/$PROJECT_ROOT/android/$APK_SOURCE" "$APK_OUTPUT"

print_success "APK 已导出"

###############################################################################
# 13. 清理（可选）
###############################################################################

print_step "清理临时文件"

# 保留构建产物，删除源代码
# rm -rf "$WORK_DIR"
# print_success "临时文件已清理"

print_info "保留构建目录以便调试: $WORK_DIR"

###############################################################################
# 14. 完成
###############################################################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "打包完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_info "APK 位置: $(pwd)/$APK_OUTPUT"
print_info "APK 大小: $(du -h "$APK_OUTPUT" | cut -f1)"
echo ""
print_info "安装到设备:"
echo "  adb install $(pwd)/$APK_OUTPUT"
echo ""
print_info "调试构建目录:"
echo "  $WORK_DIR"
echo ""
