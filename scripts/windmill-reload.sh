#!/usr/bin/env bash
# windmill-reload.sh — Reload Windmill scripts from git (local + remote)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WM_TOKEN="${WM_TOKEN:-0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA}"
WM_BASE_URL="${WM_BASE_URL:-http://localhost:8080}"
REMOTE_URL="${REMOTE_WINDMILL_URL:-}"
REMOTE_TOKEN="${REMOTE_WM_TOKEN:-}"

echo "🔄 Windmill Script Reload Protocol"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. LOCAL RELOAD
echo ""
echo "📍 LOCAL: Reloading from git..."
if curl -s -f -X POST "$WM_BASE_URL/api/git_sync" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' >/dev/null 2>&1; then
  echo "✅ Local git sync triggered"
else
  echo "⚠️  Local git sync via API failed, trying script reload..."
  if curl -s -f -X POST "$WM_BASE_URL/api/scripts/reload" \
    -H "Authorization: Bearer $WM_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' >/dev/null 2>&1; then
    echo "✅ Local script reload triggered"
  else
    echo "❌ Local reload failed (Windmill may not be running)"
  fi
fi

# 2. REMOTE RELOAD (if configured)
if [ -n "$REMOTE_URL" ] && [ -n "$REMOTE_TOKEN" ]; then
  echo ""
  echo "☁️  REMOTE: Reloading from git..."
  if curl -s -f -X POST "$REMOTE_URL/api/git_sync" \
    -H "Authorization: Bearer $REMOTE_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' >/dev/null 2>&1; then
    echo "✅ Remote git sync triggered"
  else
    echo "⚠️  Remote git sync failed (check REMOTE_WINDMILL_URL + REMOTE_WM_TOKEN)"
  fi
else
  echo ""
  echo "ℹ️  Remote not configured (set REMOTE_WINDMILL_URL + REMOTE_WM_TOKEN to enable)"
fi

# 3. VERIFICATION
echo ""
echo "✔️  Type check (Mypy)..."
uv run mypy --strict f/ && echo "✅ Python OK" || echo "❌ Mypy errors"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🟢 Ready to test in Telegram"
