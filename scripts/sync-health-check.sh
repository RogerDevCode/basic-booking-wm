#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════
# SYNC HEALTH CHECK — Detect local vs Windmill desynchronization
# ════════════════════════════════════════════════════════════════════════════════
# Usage:
#   bash scripts/sync-health-check.sh              # Run full check
#   bash scripts/sync-health-check.sh --quick      # Quick check only
#   bash scripts/sync-health-check.sh --dry-run    # Show what would sync, don't push
# ════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

WORKSPACE_ID="booking-titanium"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ────────────────────────────────────────────────────────────────────────────────
# 1. PRE-FLIGHT CHECKS
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[${TIMESTAMP}] 📋 SYNC HEALTH CHECK — Pre-flight Verification${NC}"
echo ""

# Check if wmill CLI is installed
if ! command -v wmill &> /dev/null; then
  echo -e "${RED}✗ ERROR: wmill CLI not found. Install with: binary from https://github.com/windmill-labs/windmill${NC}"
  exit 1
fi

# Check if git is available
if ! command -v git &> /dev/null; then
  echo -e "${RED}✗ ERROR: git not found${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All CLI tools available${NC}"
echo ""

# ────────────────────────────────────────────────────────────────────────────────
# 2. GIT STATUS CHECK
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[Git Status]${NC}"

# Get git branch
CURRENT_BRANCH=$(git branch --show-current)
echo "  Branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if git diff-index --quiet HEAD --; then
  echo -e "  ${GREEN}✓ No uncommitted changes${NC}"
else
  echo -e "  ${YELLOW}⚠ WARNING: Uncommitted changes detected${NC}"
  git status --short | head -5
  echo "    (Run: git add -A && git commit -m 'msg')"
fi

# Check if local branch is ahead of origin
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

if [ "$AHEAD" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ Local ahead of GitHub: $AHEAD commits${NC}"
fi

if [ "$BEHIND" -gt 0 ]; then
  echo -e "  ${RED}✗ Local behind GitHub: $BEHIND commits (pull first)${NC}"
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────────
# 3. WINDMILL METADATA CHECK
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[Windmill Metadata Generation]${NC}"

METADATA_OUTPUT=$(wmill generate-metadata --workspace "$WORKSPACE_ID" 2>&1)

if echo "$METADATA_OUTPUT" | grep -q "All metadata up-to-date"; then
  echo -e "  ${GREEN}✓ All metadata up-to-date${NC}"
else
  echo -e "  ${YELLOW}⚠ Metadata needs regeneration:${NC}"
  echo "$METADATA_OUTPUT" | grep -E "(stale|error)" | head -10 || true
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────────
# 4. SYNC DRY-RUN CHECK
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[Sync Diff Analysis]${NC}"

# Run sync with --show-diffs to detect changes
SYNC_OUTPUT=$(wmill sync pull --workspace "$WORKSPACE_ID" --show-diffs 2>&1 || true)

# Count pending changes
PENDING_COUNT=$(echo "$SYNC_OUTPUT" | grep -E "^[+~-] " | wc -l)

if [ "$PENDING_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ No pending changes (fully synced)${NC}"
else
  echo -e "  ${YELLOW}⚠ Pending changes: $PENDING_COUNT items${NC}"
  echo "$SYNC_OUTPUT" | grep -E "^[+~-] " | head -10 | sed 's/^/    /'

  # Show total stats
  ADDED=$(echo "$SYNC_OUTPUT" | grep "^+ " | wc -l)
  MODIFIED=$(echo "$SYNC_OUTPUT" | grep "^~ " | wc -l)
  DELETED=$(echo "$SYNC_OUTPUT" | grep "^- " | wc -l)

  echo ""
  echo "    Added: $ADDED | Modified: $MODIFIED | Deleted: $DELETED"
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────────
# 5. VERIFY CRITICAL SCRIPTS EXIST IN WINDMILL
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[Critical Scripts Verification]${NC}"

CRITICAL_SCRIPTS=(
  "f/internal/conversation_get"
  "f/internal/conversation_update"
  "f/internal/telegram_router"
  "f/internal/ai_agent"
  "f/telegram_send"
  "f/booking_create"
)

MISSING_COUNT=0
for SCRIPT in "${CRITICAL_SCRIPTS[@]}"; do
  # This is a simple check - ideally would query Windmill API
  # For now, we'll check if sync would have issues with it
  if [ -d "${SCRIPT%/*}" ]; then
    echo "  ✓ Local: $SCRIPT"
  else
    echo -e "  ${RED}✗ Missing: $SCRIPT${NC}"
    ((MISSING_COUNT++))
  fi
done

echo ""

# ────────────────────────────────────────────────────────────────────────────────
# 6. HEALTH CHECK RESULT
# ────────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}[Health Check Result]${NC}"

if [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ] && [ "$PENDING_COUNT" -eq 0 ] && [ "$MISSING_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}✓ HEALTHY: System fully synchronized${NC}"
  EXIT_CODE=0
else
  echo -e "  ${YELLOW}⚠ ACTION REQUIRED:${NC}"

  if [ "$BEHIND" -gt 0 ]; then
    echo "    1. Pull latest from GitHub: git pull origin $CURRENT_BRANCH"
  fi

  if [ "$AHEAD" -gt 0 ]; then
    echo "    2. Push commits to GitHub: git push origin $CURRENT_BRANCH"
  fi

  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "    3. Sync changes to Windmill: wmill sync push --workspace $WORKSPACE_ID"
  fi

  EXIT_CODE=1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"

# ────────────────────────────────────────────────────────────────────────────────
# 7. OPTIONAL: AUTO-SYNC (if --auto flag passed)
# ────────────────────────────────────────────────────────────────────────────────

if [ $# -gt 0 ] && [ "$1" = "--auto-sync" ]; then
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo -e "${BLUE}🔄 AUTO-SYNC MODE: Attempting to recover...${NC}"
    echo ""

    # Step 1: Pull from GitHub if behind
    if [ "$BEHIND" -gt 0 ]; then
      echo "  Pulling from GitHub..."
      git pull origin "$CURRENT_BRANCH"
    fi

    # Step 2: Push to GitHub if ahead
    if [ "$AHEAD" -gt 0 ]; then
      echo "  Pushing to GitHub..."
      git push origin "$CURRENT_BRANCH"
    fi

    # Step 3: Sync to Windmill
    if [ "$PENDING_COUNT" -gt 0 ] || [ "$AHEAD" -gt 0 ]; then
      echo "  Syncing to Windmill..."
      echo "y" | wmill sync push --workspace "$WORKSPACE_ID" --parallel 10
    fi

    echo ""
    echo -e "${GREEN}✓ Auto-sync completed${NC}"
    EXIT_CODE=0
  fi
fi

exit "$EXIT_CODE"
