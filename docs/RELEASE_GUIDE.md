# Release Guide (版本发布指南)

This guide outlines the steps required to release a new version of Demo2APK.

## 1. Update Version Numbers (更新版本号)

Update the version number in the following files:

### Root Package
- `package.json` (`version` field)

### Sub-packages
- `packages/core/package.json`
- `packages/backend/package.json`
- `packages/frontend/package.json`

### Documentation Badges
- `README.md`: `![Version](https://img.shields.io/badge/version-X.X.X-green)`
- `README_CN.md`: `![Version](https://img.shields.io/badge/version-X.X.X-green)`

### Frontend UI
- `packages/frontend/src/i18n/config.ts`: Update `buildVersion` in both `en` and `zh` sections.

## 2. Update Changelog (更新日志)

Add a new entry to `CHANGELOG.md`:

```markdown
## [X.X.X] - YYYY-MM-DD

### 🚀 Features
- Feature 1
- Feature 2

### 🐛 Fixes
- Fix 1
- Fix 2
```

## 3. Verify Configuration (验证配置)

If new environment variables or configuration options were added:
- Update `README.md` (Configuration section)
- Update `README_CN.md` (配置说明部分)
- Update `DEPLOYMENT.md` if necessary
- Check `docker-compose.yml` and `docker-compose.deploy.yml` default values

## 4. Build & Test (构建与测试)

Run a full build and test cycle:

```bash
# 1. Install dependencies
pnpm install

# 2. Build all packages
pnpm build

# 3. Run tests
pnpm test
```

## 5. Git Release (提交与发布)

Commit the changes and create a git tag:

```bash
# Commit changes
git add .
git commit -m "chore: release version X.X.X"

# Create tag
git tag -a vX.X.X -m "Version X.X.X"

# Push changes and tags
git push origin main
git push origin vX.X.X
```

## 6. Docker Image (Docker 镜像)

Use the following commands to build and push Docker images. **Remember to change the version number `vX.X.X` to the actual version.**

### Backend (Multi-platform)

```bash
cd /Users/deadwave/Development/demo2apk && \
docker buildx build --platform linux/amd64 \
  -t deadwavewave/demo2apk-backend:latest \
  -t deadwavewave/demo2apk-backend:vX.X.X \
  -f packages/backend/Dockerfile \
  --push .
```

### Frontend

```bash
cd /Users/deadwave/Development/demo2apk && \
docker buildx build --platform linux/amd64 \
  -t deadwavewave/demo2apk-frontend:latest \
  -t deadwavewave/demo2apk-frontend:vX.X.X \
  -f packages/frontend/Dockerfile \
  --push .
```

