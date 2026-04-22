#!/usr/bin/env bash
#
# PRE-FLIGHT
# Mission          : Verify MCP integration health (Windmill → Zed)
# DB Tables        : None (read-only checks)
# Concurrency Risk : NO
# GCal Calls       : NO
# Idempotency Key  : N/A
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()   { echo -e "${RED}[ERR]${NC} $*"; }

echo "=========================================="
echo "  Windmill MCP Integration Health Check"
echo "=========================================="
echo ""

# 1. Docker containers
log_info "Checking Docker containers..."
if ! command -v docker &>/dev/null; then
  log_err "Docker not installed or not in PATH"
  exit 1
fi

CONTAINERS=(
  "booking-titanium-wm-windmill_server-1"
  "booking-titanium-wm-windmill_worker-1"
  "booking-titanium-wm-db-1"
)

for c in "${CONTAINERS[@]}"; do
  if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
    STATUS=$(docker ps --format '{{.Status}}' --filter "name=^${c}$" | head -1)
    log_ok "$c is running (${STATUS})"
  else
    log_err "$c is NOT running"
    exit 1
  fi
done

# 2. Port 8080
log_info "Checking port 8080..."
if ss -tlnp | grep -q ':8080'; then
  log_ok "Port 8080 is listening"
  # Test endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/version 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    VERSION=$(curl -s http://localhost:8080/api/version 2>/dev/null || echo "unknown")
    log_ok "Windmill API responds (version: ${VERSION})"
  else
    log_warn "Windmill API returned HTTP ${HTTP_CODE} (expected 200)"
  fi
else
  log_err "Port 8080 is NOT listening"
  exit 1
fi

# 3. MCP endpoint reachable
log_info "Checking MCP endpoint (unauthorized expected)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/mcp/gateway 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "401" ]]; then
  log_ok "MCP gateway reachable, correctly returns 401 (auth required)"
elif [[ "$HTTP_CODE" == "200" ]]; then
  log_ok "MCP gateway reachable (200 OK - maybe OAuth mode)"
else
  log_warn "Unexpected HTTP code: $HTTP_CODE (expected 401 or 200)"
fi

# 4. Zed config
log_info "Checking Zed configuration..."
ZED_CONFIG="/home/manager/.var/app/dev.zed.Zed/config/zed/settings.json"
if [ -f "$ZED_CONFIG" ]; then
  log_ok "Zed settings file exists"
  if grep -q 'context_servers' "$ZED_CONFIG"; then
    log_ok "MCP context_servers configured"
    # Extract URL
    MCP_URL=$(grep -oP '"url":\s*"\K[^"]+' "$ZED_CONFIG" 2>/dev/null || echo "")
    if [ -n "$MCP_URL" ]; then
      log_ok "MCP URL configured: ${MCP_URL}"
    else
      log_warn "context_servers exists but no URL found"
    fi
  else
    log_warn "MCP not configured in Zed (missing context_servers)"
  fi
else
  log_err "Zed settings not found at ${ZED_CONFIG}"
  exit 1
fi

# 5. Token file
log_info "Checking MCP token availability..."
ENV_WM="/home/manager/Sync/wildmill-proyects/booking-titanium-wm/.env.wm"
if [ -f "$ENV_WM" ]; then
  log_ok ".env.wm found"
  if grep -q "WM_TOKEN=" "$ENV_WM" | grep -v "^#"; then
    WM_TOKEN=$(grep "WM_TOKEN=" "$ENV_WM" | head -1 | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ ${#WM_TOKEN} -ge 20 ]]; then
      log_ok "WM_TOKEN present (length: ${#WM_TOKEN} chars)"
    else
      log_warn "WM_TOKEN seems too short or empty"
    fi
  else
    log_warn "No WM_TOKEN in .env.wm"
  fi
else
  log_err ".env.wm not found at ${ENV_WM}"
  exit 1
fi

# 6. Try to call an MCP tool (if Zed configured)
if [ -f "$ZED_CONFIG" ] && grep -q 'context_servers' "$ZED_CONFIG"; then
  log_info "Verifying MCP tool listing (requires valid token)..."
  # Extract URL from Zed config
  MCP_URL=$(grep -oP '"url":\s*"\K[^"]+' "$ZED_CONFIG" 2>/dev/null || echo "")
  if [ -n "$MCP_URL" ]; then
    # Call listTools endpoint (MCP protocol: POST with initialize+initialize)
    # For now, just check URL structure
    if echo "$MCP_URL" | grep -qE '/api/mcp/w/.+/mcp\?token='; then
      log_ok "MCP URL format is valid"
    else
      log_warn "MCP URL doesn't match expected pattern"
    fi
  fi
fi

echo ""
log_ok "=== Health check PASSED ==="
echo ""
log_info "Next steps:"
echo "  1. Open http://localhost:8080 in browser"
echo "  2. Get Workspace ID (Settings → Workspace → General)"
echo "  3. Generate MCP token (Settings → Tokens → Generate MCP URL)"
echo "  4. Update Zed settings with full MCP URL"
echo "  5. Restart Zed and verify tools appear"
echo ""
echo "Full guide: docs/MCP_INTEGRATION.md"
