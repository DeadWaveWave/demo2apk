#!/usr/bin/env bash

###############################################################################
# check-env.sh - 检查打包 APK 所需的环境是否完整
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
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

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_header "Demo2APK 环境检查工具"

ERRORS=0
WARNINGS=0

# 1. 检查 Node.js
echo "1. 检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION"
else
    print_error "未安装 Node.js"
    print_info "请访问 https://nodejs.org/ 下载安装"
    ((ERRORS++))
fi

# 2. 检查 npm
echo ""
echo "2. 检查 npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION"
else
    print_error "未安装 npm"
    ((ERRORS++))
fi

# 3. 检查 Java
echo ""
echo "3. 检查 Java JDK..."
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -n 1)
    print_success "$JAVA_VERSION"
    
    # 检查版本号
    if java -version 2>&1 | grep -q "version \"1[1-9]"; then
        print_info "JDK 版本合适（需要 11+）"
    else
        print_warning "建议使用 JDK 11 或更高版本"
        ((WARNINGS++))
    fi
else
    print_error "未安装 Java JDK"
    print_info "请安装 JDK 11 或 17"
    ((ERRORS++))
fi

# 4. 检查 Android SDK
echo ""
echo "4. 检查 Android SDK..."
if [ -n "$ANDROID_HOME" ] || [ -n "$ANDROID_SDK_ROOT" ]; then
    SDK_PATH="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
    print_success "ANDROID_HOME: $SDK_PATH"
    
    # 检查路径是否存在
    if [ -d "$SDK_PATH" ]; then
        print_success "SDK 目录存在"
        
        # 检查必要的工具
        if [ -d "$SDK_PATH/platform-tools" ]; then
            print_success "platform-tools 已安装"
        else
            print_warning "platform-tools 未安装"
            print_info "运行: sdkmanager \"platform-tools\""
            ((WARNINGS++))
        fi
        
        if [ -d "$SDK_PATH/build-tools" ]; then
            BUILD_TOOLS_VERSION=$(ls "$SDK_PATH/build-tools" | sort -V | tail -1)
            print_success "build-tools 已安装 (版本: $BUILD_TOOLS_VERSION)"
        else
            print_warning "build-tools 未安装"
            print_info "运行: sdkmanager \"build-tools;33.0.0\""
            ((WARNINGS++))
        fi
        
        # 检查平台
        if [ -d "$SDK_PATH/platforms" ]; then
            PLATFORMS=$(ls "$SDK_PATH/platforms" | wc -l | tr -d ' ')
            print_success "Android 平台已安装 ($PLATFORMS 个)"
        else
            print_warning "未安装 Android 平台"
            print_info "运行: sdkmanager \"platforms;android-33\""
            ((WARNINGS++))
        fi
    else
        print_error "SDK 目录不存在: $SDK_PATH"
        ((ERRORS++))
    fi
else
    print_error "未设置 ANDROID_HOME 或 ANDROID_SDK_ROOT"
    print_info "常见位置:"
    print_info "  macOS: $HOME/Library/Android/sdk"
    print_info "  Linux: $HOME/Android/Sdk"
    print_info ""
    print_info "设置方法:"
    print_info "  export ANDROID_HOME=\$HOME/Library/Android/sdk  # 添加到 ~/.zshrc 或 ~/.bashrc"
    
    # 尝试自动查找
    print_info ""
    print_info "尝试自动查找..."
    FOUND=0
    for path in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "/opt/android-sdk"; do
        if [ -d "$path" ]; then
            print_warning "找到 Android SDK: $path"
            print_info "建议运行:"
            print_info "  export ANDROID_HOME=$path"
            FOUND=1
        fi
    done
    
    if [ $FOUND -eq 0 ]; then
        print_error "未找到 Android SDK"
    fi
    
    ((ERRORS++))
fi

# 5. 检查 Cordova
echo ""
echo "5. 检查 Cordova..."
if command -v cordova &> /dev/null; then
    CORDOVA_VERSION=$(cordova --version)
    print_success "Cordova $CORDOVA_VERSION"
else
    print_warning "未安装 Cordova CLI"
    print_info "脚本会自动安装，或手动运行: npm install -g cordova"
    ((WARNINGS++))
fi

# 6. 检查 Gradle（可选）
echo ""
echo "6. 检查 Gradle..."
if command -v gradle &> /dev/null; then
    GRADLE_VERSION=$(gradle --version | grep "Gradle" | head -1)
    print_success "$GRADLE_VERSION"
else
    print_info "未安装全局 Gradle（不影响使用，脚本会使用 Gradle Wrapper）"
fi

# 7. 检查 ADB
echo ""
echo "7. 检查 ADB (Android Debug Bridge)..."
if command -v adb &> /dev/null; then
    ADB_VERSION=$(adb version | head -1)
    print_success "$ADB_VERSION"
    
    # 检查连接的设备
    DEVICES=$(adb devices | grep -v "List" | grep "device$" | wc -l | tr -d ' ')
    if [ "$DEVICES" -gt 0 ]; then
        print_success "已连接 $DEVICES 个 Android 设备"
    else
        print_info "未连接 Android 设备（不影响打包）"
    fi
else
    print_info "未安装 ADB（不影响打包，但无法直接安装到设备）"
fi

# 8. 检查其他工具
echo ""
echo "8. 检查其他工具..."

if command -v unzip &> /dev/null; then
    print_success "unzip 已安装"
else
    print_error "未安装 unzip"
    ((ERRORS++))
fi

if command -v zip &> /dev/null; then
    print_success "zip 已安装"
else
    print_warning "未安装 zip"
    ((WARNINGS++))
fi

# 9. 测试脚本可执行性
echo ""
echo "9. 检查脚本..."
if [ -x "html2apk.sh" ]; then
    print_success "html2apk.sh 可执行"
else
    print_warning "html2apk.sh 不可执行，运行: chmod +x html2apk.sh"
    ((WARNINGS++))
fi

if [ -x "react-zip2apk.sh" ]; then
    print_success "react-zip2apk.sh 可执行"
else
    print_warning "react-zip2apk.sh 不可执行，运行: chmod +x react-zip2apk.sh"
    ((WARNINGS++))
fi

# 10. 检查测试文件
echo ""
echo "10. 检查测试文件..."
if [ -f "test-demo.html" ]; then
    print_success "test-demo.html 存在"
else
    print_warning "test-demo.html 不存在"
    ((WARNINGS++))
fi

if [ -f "test-react-app.zip" ]; then
    print_success "test-react-app.zip 存在"
else
    print_warning "test-react-app.zip 不存在，运行: ./create-test-react.sh"
    ((WARNINGS++))
fi

# 总结
print_header "检查结果"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "环境配置完美！可以开始使用了 🎉"
    echo ""
    print_info "快速测试:"
    echo "  ./html2apk.sh test-demo.html"
    echo "  ./react-zip2apk.sh test-react-app.zip"
elif [ $ERRORS -eq 0 ]; then
    print_warning "环境基本配置完成，有 $WARNINGS 个警告"
    print_info "可以开始使用，但建议修复警告项以获得最佳体验"
else
    print_error "发现 $ERRORS 个错误和 $WARNINGS 个警告"
    print_info "请先修复错误项后再使用"
    echo ""
    print_info "获取帮助："
    echo "  查看 README.md 了解详细的环境配置说明"
    exit 1
fi

echo ""
