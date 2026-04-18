#!/usr/bin/env bash
# windmill-up.sh — Start Windmill with local PostgreSQL (production-grade)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "🚀 Starting Windmill with local PostgreSQL..."
docker-compose \
  --env-file .env.wm.local \
  -f docker-compose.windmill.yml \
  up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "📊 Service status:"
docker-compose --env-file .env.wm.local -f docker-compose.windmill.yml ps

# Wait for server to be ready
echo "🔄 Waiting for Windmill server to be ready..."
for i in {1..30}; do
  if curl -sf http://localhost:8080/api/version >/dev/null 2>&1; then
    echo "✅ Windmill ready!"
    echo ""
    echo "📍 Access Windmill: http://localhost:8080"
    echo "🔑 API Token: 0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA"
    echo ""
    exit 0
  fi
  echo "  [$i/30] Waiting... ($(($i * 2))s)"
  sleep 2
done

echo "❌ Windmill failed to start. Check logs:"
docker-compose --env-file .env.wm.local -f docker-compose.windmill.yml logs windmill_server | tail -50
exit 1
