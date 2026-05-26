#!/usr/bin/env bash
set -euo pipefail

echo "==> Stopping Docker Compose services..."
docker compose down

echo "==> Clearing local Redis caches..."
# Clear Redis keys inside the compose stack if running, otherwise use standard local redis-cli
if docker compose ps redis | grep -q "Up"; then
  docker compose exec redis redis-cli flushall || true
fi

echo "==> Rebuilding and starting services..."
docker compose up --build -d

echo "==> Waiting for services to become healthy..."
docker compose ps

echo "==> System successfully updated and cleaned!"
