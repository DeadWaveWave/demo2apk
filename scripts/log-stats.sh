#!/usr/bin/env bash

set -euo pipefail

# Resolve repo root (scripts/..)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 默认使用生产部署用的 docker-compose 配置
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file '$COMPOSE_FILE' not found in $ROOT_DIR" >&2
  echo "Please run this script from the Demo2APK repo root, or set COMPOSE_FILE explicitly." >&2
  exit 1
fi

# 将所有参数透传给 logStats 脚本，例如：
#   ./scripts/log-stats.sh --date=2025-12-08
#   ./scripts/log-stats.sh --types --date=2025-12-08
#   ./scripts/log-stats.sh --apps --date=2025-12-08
#   ./scripts/log-stats.sh --json --date=2025-12-08
docker compose -f "$COMPOSE_FILE" run --rm api \
  node packages/backend/dist/scripts/logStats.js "$@"


