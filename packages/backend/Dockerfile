# Demo2APK Backend Dockerfile
# Multi-stage build for smaller final image

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core/ ./packages/core/
COPY packages/backend/ ./packages/backend/

# Build packages
RUN pnpm --filter @demo2apk/core build
RUN pnpm --filter @demo2apk/backend build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

# Install system dependencies for Android builds
# Note: We need JDK 21 for Capacitor Android builds (capacitor-android requires Java 21)
# Using Eclipse Temurin since Debian Bookworm only has JDK 17 in official repos
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Eclipse Temurin JDK 21
RUN mkdir -p /usr/lib/jvm && \
    ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_linux_hotspot_21.0.5_11.tar.gz"; \
    elif [ "$ARCH" = "arm64" ]; then \
        JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_aarch64_linux_hotspot_21.0.5_11.tar.gz"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    wget -q -O /tmp/jdk.tar.gz "$JDK_URL" && \
    tar -xzf /tmp/jdk.tar.gz -C /usr/lib/jvm && \
    rm /tmp/jdk.tar.gz && \
    mv /usr/lib/jvm/jdk-21* /usr/lib/jvm/temurin-21

# Set Java environment
ENV JAVA_HOME=/usr/lib/jvm/temurin-21
ENV PATH=$JAVA_HOME/bin:$PATH

# Verify Java installation
RUN java -version

# Install Android SDK command line tools
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

RUN mkdir -p $ANDROID_HOME/cmdline-tools && \
    cd $ANDROID_HOME/cmdline-tools && \
    curl -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip cmdline-tools.zip && \
    rm cmdline-tools.zip && \
    mv cmdline-tools latest

# Accept licenses and install SDK components
# Install components one by one with retry logic to handle network issues
RUN yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses

# Install platform-tools with retry
RUN for i in 1 2 3 4 5; do \
        $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" && break || \
        echo "Retry $i failed, waiting 10s..." && sleep 10; \
    done

# Install platforms with retry
RUN for i in 1 2 3 4 5; do \
        $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35" && break || \
        echo "Retry $i failed, waiting 10s..." && sleep 10; \
    done

# Install build-tools with retry
RUN for i in 1 2 3 4 5; do \
        $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "build-tools;35.0.0" && break || \
        echo "Retry $i failed, waiting 10s..." && sleep 10; \
    done

# Install Node.js tools
# Note: cordova-android is installed per-project by cordova platform add
RUN npm install -g pnpm cordova

# Copy the entire built application including node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Copy scripts
COPY scripts/ ./scripts/

# Create directories for builds and uploads
RUN mkdir -p /app/builds /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BUILDS_DIR=/app/builds
ENV UPLOADS_DIR=/app/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command - API server
CMD ["node", "packages/backend/dist/index.js"]
