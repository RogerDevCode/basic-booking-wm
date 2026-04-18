#!/usr/bin/env bash
# windmill-down.sh — Stop Windmill

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "⏹️  Stopping Windmill..."
docker-compose \
  --env-file .env.wm.local \
  -f docker-compose.windmill.yml \
  down

echo "✅ Windmill stopped"
