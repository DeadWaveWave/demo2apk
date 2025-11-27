#!/usr/bin/env bash

###############################################################################
# html2apk.sh - 从单个 HTML 文件打包成 Android APK
# 使用 Cordova + Gradle 实现
# 
# 用法:
#   ./html2apk.sh <input.html> [app-name] [app-id]
#
# 示例:
#   ./html2apk.sh mypage.html MyApp com.example.myapp
#
# 输出:
#   生成的 APK 在 ./output/<app-name>/app-debug.apk
###############################################################################

set -e  # 遇到错误立即退出

ORIG_PWD="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ROOT_DIR="$ORIG_PWD"
GRADLE_VERSION="8.9"
GRADLE_DIST_URL="https://mirrors.cloud.tencent.com/gradle/gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_BIN="" # 运行 wrapper 的 Gradle 可执行文件
OFFLINE_TMP_DIR=""
OFFLINEIFY_SCRIPT="$SCRIPT_DIR/offlineify-html.js"

cleanup() {
    if [ -n "$OFFLINE_TMP_DIR" ] && [ -d "$OFFLINE_TMP_DIR" ]; then
        rm -rf "$OFFLINE_TMP_DIR"
    fi
}
trap cleanup EXIT

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

# 根据 App 名称生成包名（如果未手动传入 app-id）
generate_app_id() {
    local raw="$1"
    local sanitized
    sanitized="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/./g')"
    sanitized="$(echo "$sanitized" | sed -E 's/\.+/./g; s/^\.+//; s/\.+$//')"
    if [ -z "$sanitized" ]; then
        sanitized="app"
    fi

    local IFS='.'
    read -r -a parts <<< "$sanitized"
    local fixed_parts=()
    for idx in "${!parts[@]}"; do
        local part="${parts[$idx]}"
        if [ -z "$part" ]; then
            part="app$idx"
        elif [[ ! "$part" =~ ^[a-z] ]]; then
            part="a${part}"
        fi
        fixed_parts+=("$part")
    done
    sanitized="$(IFS='.'; echo "${fixed_parts[*]}")"

    echo "com.vibecoding.${sanitized}"
}

# 确保本地可用的 Gradle（无系统 gradle 时使用镜像下载）
ensure_local_gradle() {
    if command -v gradle >/dev/null 2>&1; then
        GRADLE_BIN="$(command -v gradle)"
        print_success "Gradle: $GRADLE_BIN"
        return
    fi

    local local_gradle_dir="$ROOT_DIR/output/.gradle/gradle-${GRADLE_VERSION}"
    if [ ! -d "$local_gradle_dir" ]; then
        print_info "下载 Gradle ${GRADLE_VERSION}（镜像: $GRADLE_DIST_URL）..."
        mkdir -p "$ROOT_DIR/output/.gradle"
        tmp_zip="$(mktemp)"
        curl -L "$GRADLE_DIST_URL" -o "$tmp_zip"
        unzip -q "$tmp_zip" -d "$ROOT_DIR/output/.gradle"
        rm -f "$tmp_zip"
    fi

    GRADLE_BIN="$local_gradle_dir/bin/gradle"
    if [ ! -x "$GRADLE_BIN" ]; then
        print_error "Gradle 下载失败: $GRADLE_BIN 不可执行"
        exit 1
    fi
    print_success "使用本地 Gradle: $GRADLE_BIN"
}

# 安装 offlineify 所需依赖
ensure_offlineify_deps() {
    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        print_warning "缺少 package.json，无法自动安装 offlineify 依赖"
        return 1
    fi

    if [ ! -d "$SCRIPT_DIR/node_modules" ] || [ ! -f "$SCRIPT_DIR/node_modules/.bin/tailwindcss" ]; then
        print_info "安装 offlineify 依赖..."
        (cd "$SCRIPT_DIR" && npm install)
    fi
    return 0
}

# 根据 HTML 内容是否包含外部 CDN/JSX 自动离线化
maybe_offlineify() {
    if [ -n "$SKIP_OFFLINEIFY" ]; then
        print_info "检测到 SKIP_OFFLINEIFY，跳过自动离线化"
        return
    fi

    if [ ! -f "$OFFLINEIFY_SCRIPT" ]; then
        return
    fi

    if ! grep -qiE 'text/babel|cdn\.|unpkg\.com|fonts\.googleapis|@babel/standalone|canvas-confetti' "$HTML_FILE_ABS"; then
        return
    fi

    print_step "离线化 Web 资源"
    if ! ensure_offlineify_deps; then
        print_warning "无法安装 offlineify 依赖，继续使用原始 HTML"
        return
    fi

    OFFLINE_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/offlineify.XXXXXX")"
    node "$OFFLINEIFY_SCRIPT" "$HTML_FILE_ABS" "$OFFLINE_TMP_DIR"
    HTML_FILE_ABS="$OFFLINE_TMP_DIR/index.html"
    print_success "HTML 已离线化: $HTML_FILE_ABS"
}

###############################################################################
# 1. 检查参数
###############################################################################

if [ -z "$1" ]; then
    print_error "缺少 HTML 文件参数"
    echo ""
    echo "用法: $0 <input.html> [app-name] [app-id]"
    echo ""
    echo "示例:"
    echo "  $0 mypage.html"
    echo "  $0 mypage.html MyApp com.example.myapp"
    exit 1
fi

HTML_FILE="$1"
APP_NAME="${2:-MyVibeApp}"
if [ -n "$3" ]; then
    APP_ID="$3"
else
    APP_ID="$(generate_app_id "$APP_NAME")"
fi

# 检查 HTML 文件是否存在
if [ ! -f "$HTML_FILE" ]; then
    print_error "HTML 文件不存在: $HTML_FILE"
    exit 1
fi

# 立即获取 HTML 文件的绝对路径，避免后续 cd 后路径失效
HTML_FILE_ABS="$(cd "$(dirname "$HTML_FILE")" && pwd)/$(basename "$HTML_FILE")"

print_step "配置信息"
print_info "HTML 文件: $HTML_FILE_ABS"
print_info "应用名称: $APP_NAME"
print_info "应用 ID: $APP_ID"

###############################################################################
# 2. 检查环境依赖
###############################################################################

print_step "检查环境依赖"

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

# 检查或安装 Cordova
if ! command -v cordova &> /dev/null; then
    print_warning "未安装 Cordova CLI，正在安装..."
    npm install -g cordova
    print_success "Cordova 安装完成"
else
print_success "Cordova $(cordova --version)"
fi

###############################################################################
# 2.5 自动离线化（如检测到外部 CDN 或 JSX）
###############################################################################

maybe_offlineify

###############################################################################
# 3. 创建工作目录
###############################################################################

print_step "创建工作目录"

WORK_DIR="./output/${APP_NAME}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

print_success "工作目录: $WORK_DIR"

###############################################################################
# 4. 创建 Cordova 项目
###############################################################################

print_step "创建 Cordova 项目"

cd "$WORK_DIR"
cordova create . "$APP_ID" "$APP_NAME" --no-telemetry

print_success "Cordova 项目创建完成"

###############################################################################
# 5. 添加 Android 平台
###############################################################################

print_step "添加 Android 平台"

cordova platform add android --no-telemetry

print_success "Android 平台添加完成"

###############################################################################
# 6. 复制 HTML 文件到 www 目录
###############################################################################

print_step "准备 Web 资源"

# 清空 www 目录
rm -rf www/*

# 将 HTML 所在目录的所有资源拷贝进 www（便于携带本地 CSS/JS/字体等）
HTML_DIR="$(dirname "$HTML_FILE_ABS")"
cp -R "$HTML_DIR"/. www/

# 将入口 HTML 重命名为 index.html（Cordova 入口）
HTML_BASENAME="$(basename "$HTML_FILE_ABS")"
if [ "$HTML_BASENAME" != "index.html" ]; then
    mv "www/$HTML_BASENAME" www/index.html
fi

# 检查 HTML 是否已包含必要的 meta 标签
# 如果没有 viewport meta 标签，则添加
if ! grep -q "viewport" www/index.html; then
    print_info "添加 viewport meta 标签..."
    if grep -q "<head" www/index.html; then
        sed -i.bak '/<head/a\
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
' www/index.html
        rm -f www/index.html.bak
    fi
fi

# 如果没有 CSP meta 标签，则添加（Cordova 需要）
if ! grep -q "Content-Security-Policy" www/index.html; then
    print_info "添加 Content-Security-Policy meta 标签..."
    if grep -q "<head" www/index.html; then
        sed -i.bak '/<head/a\
    <meta http-equiv="Content-Security-Policy" content="default-src * '\''self'\'' '\''unsafe-inline'\'' '\''unsafe-eval'\'' data: gap: content:">
' www/index.html
        rm -f www/index.html.bak
    fi
fi

# 添加 Cordova.js 引用（如果没有）
if ! grep -q "cordova.js" www/index.html; then
    print_info "添加 Cordova.js 引用..."
    # 在 </body> 前添加 cordova.js
    if grep -q "</body>" www/index.html; then
        sed -i.bak 's|</body>|    <script src="cordova.js"></script>\n</body>|' www/index.html
        rm -f www/index.html.bak
    fi
fi

print_success "HTML 文件已复制到 Cordova 项目"

###############################################################################
# 7. 同步 Web 资源到 Android 平台
###############################################################################

print_step "同步 Web 资源到 Android 平台"

# 让 Cordova 将 www 目录的最新内容同步到各平台
cordova prepare android --no-telemetry

print_success "Web 资源已同步"

###############################################################################
# 8. 构建 Debug APK
###############################################################################

print_step "构建 Debug APK"

cd platforms/android

# 新版 Cordova Android 不再包含 Gradle Wrapper，需要手动生成
if [ ! -f "gradlew" ]; then
    print_info "生成 Gradle Wrapper..."
    ensure_local_gradle
    "$GRADLE_BIN" wrapper --gradle-version "$GRADLE_VERSION" --gradle-distribution-url "$GRADLE_DIST_URL"
else
    print_success "Gradle Wrapper 已存在，跳过下载"
fi

# 确保 gradlew 有执行权限
chmod +x gradlew 2>/dev/null || true

# 使用 Gradle Wrapper 构建
if [ -f "gradlew" ]; then
    ./gradlew assembleDebug --no-daemon
else
    print_error "无法创建 Gradle Wrapper"
    exit 1
fi

cd ../..

print_success "APK 构建完成"

###############################################################################
# 9. 查找并复制 APK
###############################################################################

print_step "导出 APK"

APK_SOURCE="platforms/android/app/build/outputs/apk/debug/app-debug.apk"

if [ ! -f "$APK_SOURCE" ]; then
    print_error "未找到生成的 APK: $APK_SOURCE"
    exit 1
fi

APK_OUTPUT="../../${APP_NAME}-debug.apk"
cp "$APK_SOURCE" "$APK_OUTPUT"

print_success "APK 已导出"

###############################################################################
# 10. 完成
###############################################################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "打包完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_info "APK 位置: $(cd ../.. && pwd)/${APP_NAME}-debug.apk"
print_info "APK 大小: $(du -h "$APK_OUTPUT" | cut -f1)"
echo ""
print_info "安装到设备:"
echo "  adb install $(cd ../.. && pwd)/${APP_NAME}-debug.apk"
echo ""
