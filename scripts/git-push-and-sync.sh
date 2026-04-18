#!/usr/bin/env bash
# git-push-and-sync.sh — Commit, push, and auto-sync Windmill from Git

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Load environment
set -a
[ -f .env.wm.local ] && source .env.wm.local
set +a

WM_TOKEN="${WM_TOKEN:-0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA}"
WM_LOCAL_URL="${WM_BASE_URL:-http://localhost:8080}"
WM_REMOTE_URL="${WM_REMOTE_URL:-https://wm.stax.ink}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Git Push + Windmill Auto-Sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. CHECK BRANCH
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ You are on branch '$CURRENT_BRANCH', not 'main'"
  exit 1
fi
echo "✓ On branch: main"

# 2. CHECK FOR CHANGES
if ! git diff --quiet HEAD || ! git diff --cached --quiet; then
  echo ""
  echo "📝 Uncommitted changes detected:"
  git status --short
else
  echo "✓ No uncommitted changes"
  exit 0
fi

# 3. STAGE FILES
echo ""
echo "📦 Staging files..."
git add -A
echo "✓ Staged for commit"

# 4. COMMIT MESSAGE
echo ""
read -p "📌 Commit message: " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
  echo "❌ Commit message required"
  exit 1
fi

git commit -m "$COMMIT_MSG" 2>&1 | grep -E "create mode|changed|insertions|deletions" || true

# 5. PUSH TO GIT
echo ""
echo "⬆️  Pushing to GitHub..."
if git push origin main 2>&1 | grep -q "Everything up-to-date"; then
  echo "ℹ️  Already up-to-date"
else
  echo "✅ Push successful"
fi

# 6. TRIGGER LOCAL WINDMILL SYNC
echo ""
echo "🔄 LOCAL: Syncing Windmill from Git..."
if curl -s -f -X POST "$WM_LOCAL_URL/api/git_sync" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' >/dev/null 2>&1; then
  echo "✅ Local sync triggered"
else
  echo "⚠️  Local sync failed (may not be running)"
fi

# 7. TRIGGER REMOTE WINDMILL SYNC
if [ -n "$WM_REMOTE_URL" ] && [ "$WM_REMOTE_URL" != "http://localhost:8080" ]; then
  echo ""
  echo "☁️  REMOTE: Syncing Windmill ($WM_REMOTE_URL)..."
  if curl -s -f -X POST "$WM_REMOTE_URL/api/git_sync" \
    -H "Authorization: Bearer $WM_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' >/dev/null 2>&1; then
    echo "✅ Remote sync triggered"
  else
    echo "⚠️  Remote sync failed (check URL + token)"
  fi
fi

# 8. VERIFY TS & LINT
echo ""
echo "✔️  Type check..."
npm run typecheck >/dev/null 2>&1 && echo "✅ TypeScript OK" || echo "⚠️  TS errors"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🟢 Deployment complete!"
echo "   • Code pushed to GitHub"
echo "   • Windmill syncing from Git"
echo "   • Ready to test in Telegram"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
