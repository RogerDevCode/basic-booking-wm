#!/usr/bin/env bash
#
# PRE-FLIGHT
# Mission          : Generate MCP token for Zed integration (requires WM_TOKEN)
# DB Tables        : None (API call only)
# Concurrency Risk : NO
# GCal Calls       : NO
# Idempotency Key  : N/A
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()   { echo -e "${RED}[ERR]${NC} $*"; }

echo "=========================================="
echo "  Windmill MCP Token Generator"
echo "=========================================="
echo ""

PROJECT_ROOT="/home/manager/Sync/wildmill-proyects/booking-titanium-wm"
ENV_WM="${PROJECT_ROOT}/.env.wm"
WM_BASE_URL="${WM_BASE_URL:-http://localhost:8000}"

# Check dependencies
log_info "Checking dependencies..."
if ! command -v docker &>/dev/null; then
  log_err "Docker required but not found"
  exit 1
fi
log_ok "Docker available"

# Load WM_TOKEN
if [ ! -f "$ENV_WM" ]; then
  log_err ".env.wm not found at ${ENV_WM}"
  exit 1
fi

if ! grep -q "WM_TOKEN=" "$ENV_WM" | grep -v "^#"; then
  log_err "WM_TOKEN not set in .env.wm"
  exit 1
fi

WM_TOKEN=$(grep "WM_TOKEN=" "$ENV_WM" | head -1 | cut -d'=' -f2 | tr -d '"' | tr -d "'")
log_ok "WM_TOKEN loaded (${#WM_TOKEN} chars)"

# Validate token format
if ! echo "$WM_TOKEN" | grep -qE '^[A-Za-z0-9]{20,}$'; then
  log_warn "WM_TOKEN format unexpected (expected base62-like, 20+ chars)"
fi

# Get workspace ID via API
log_info "Fetching workspace ID from Windmill API..."
API_RESPONSE=$(docker exec booking-titanium-wm-windmill_server-1 curl -s \
  -H "Authorization: Bearer ${WM_TOKEN}" \
  "${WM_BASE_URL}/api/w/list" 2>/dev/null || echo '{"error":"failed"}')

if echo "$API_RESPONSE" | grep -q "error"; then
  log_warn "Direct API call failed (might be UI-only endpoint)"
  log_info "Attempting alternative endpoint..."
  API_RESPONSE=$(docker exec booking-titanium-wm-windmill_server-1 curl -s \
    -H "Authorization: Bearer ${WM_TOKEN}" \
    "${WM_BASE_URL}/api/w/me" 2>/dev/null || echo "{}")
fi

# Parse workspace ID (try multiple approaches)
WORKSPACE_ID=""
if echo "$API_RESPONSE" | grep -qE '"workspace_id"|"id"'; then
  WORKSPACE_ID=$(echo "$API_RESPONSE" | grep -oP '"workspace_id"\s*:\s*"\K[^"]+' | head -1)
  if [ -z "$WORKSPACE_ID" ]; then
    WORKSPACE_ID=$(echo "$API_RESPONSE" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
  fi
fi

if [ -n "$WORKSPACE_ID" ]; then
  log_ok "Workspace detected: ${WORKSPACE_ID}"
else
  log_warn "Could not auto-detect workspace ID from API"
  log_info "Possible causes:"
  log_info "  - WM_TOKEN lacks read:workspaces scope"
  log_info "  - API endpoint differs in this Windmill version"
fi

# Method 2: Try to read from database if available
if [ -z "$WORKSPACE_ID" ]; then
  log_info "Attempting to read workspace ID from database..."
  if docker exec booking-titanium-wm-db-1 psql -U postgres -d windmill -c "\dt" &>/dev/null; then
    # Try common table names
    for tbl in workspace workspaces app_workspace windmill_workspace; do
      if docker exec booking-titanium-wm-db-1 psql -U postgres -d windmill -c "SELECT 1 FROM ${tbl} LIMIT 1" &>/dev/null; then
        WORKSPACE_ID=$(docker exec booking-titanium-wm-db-1 psql -U postgres -d windmill -t -c "SELECT workspace_id FROM ${tbl} LIMIT 1" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$WORKSPACE_ID" ]; then
          log_ok "Workspace found in table '${tbl}': ${WORKSPACE_ID}"
          break
        fi
      fi
    done
  fi
fi

# Final fallback: prompt user
if [ -z "$WORKSPACE_ID" ]; then
  log_warn "Workspace ID not auto-detected"
  read -p "Enter Workspace ID manually (from Settings → Workspace → General): " WORKSPACE_ID
  if [ -z "$WORKSPACE_ID" ]; then
    log_err "Workspace ID is required"
    exit 1
  fi
fi

# Validate UUID format
if ! echo "$WORKSPACE_ID" | grep -qE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
  log_warn "Workspace ID doesn't look like UUID: ${WORKSPACE_ID}"
  read -p "Continue anyway? (y/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Generate MCP token via API (Token creation)
log_info "Generating MCP token..."
MCP_TOKEN_NAME="mcp-token-$(date +%s)"
# Try to create token via API (requires admin scope)
CREATE_RESPONSE=$(docker exec booking-titanium-wm-windmill_server-1 curl -s -X POST \
  -H "Authorization: Bearer ${WM_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${MCP_TOKEN_NAME}\",\"scopes\":[\"mcp:*\"],\"expiration\":null}" \
  "${WM_BASE_URL}/api/w/${WORKSPACE_ID}/tokens" 2>/dev/null || echo '{}')

# Check response
if echo "$CREATE_RESPONSE" | grep -q "token"; then
  MCP_TOKEN=$(echo "$CREATE_RESPONSE" | grep -oP '"token"\s*:\s*"\K[^"]+' | head -1)
  if [ -n "$MCP_TOKEN" ]; then
    log_ok "MCP token generated successfully"
  else
    log_warn "Token creation API succeeded but no token found in response"
    MCP_TOKEN=""
  fi
else
  log_warn "Token creation via API failed (may require UI generation)"
  MCP_TOKEN=""
fi

# If API failed, instruct user
if [ -z "$MCP_TOKEN" ]; then
  log_info "=========================================="
  log_info "MANUAL TOKEN GENERATION REQUIRED"
  log_info "=========================================="
  log_info ""
  log_info "Your WM_TOKEN (admin) is configured, but automatic MCP token"
  log_info "generation failed (likely missing admin scope or different API)."
  log_info ""
  log_info "Please generate MCP token manually:"
  log_info "  1. Open http://localhost:8080 in browser"
  log_info "  2. Login as admin"
  log_info "  3. Settings (gear) → Tokens"
  log_info "  4. Toggle 'Generate MCP URL' to ON"
  log_info "  5. Select scope: 'All' (or Favorites)"
  log_info "  6. Click 'Generate MCP URL'"
  log_info "  7. COPY the full URL"
  log_info ""
  MCP_URL_MANUAL="http://localhost:8000/api/mcp/w/${WORKSPACE_ID}/mcp?token=<PUT_TOKEN_HERE>"
  log_info "Expected URL format: ${MCP_URL_MANUAL}"
  log_info ""
  read -p "After generating token, paste the full MCP URL here: " MCP_URL_INPUT
  if [ -n "$MCP_URL_INPUT" ]; then
    # Validate format
    if echo "$MCP_URL_INPUT" | grep -qE '/api/mcp/w/.+/mcp\?token='; then
      log_ok "MCP URL format validated"
      # Extract token
      MCP_TOKEN=$(echo "$MCP_URL_INPUT" | grep -oP '\?token=\K[^&]+' || echo "")
      if [ -n "$MCP_TOKEN" ]; then
        log_ok "Token extracted from URL"
      fi
    else
      log_err "URL format incorrect. Expected: http://host/api/mcp/w/{workspace_id}/mcp?token={token}"
      exit 1
    fi
  else
    log_err "No URL provided. Aborting."
    exit 1
  fi
fi

# Final MCP URL
MCP_URL="http://localhost:8000/api/mcp/w/${WORKSPACE_ID}/mcp?token=${MCP_TOKEN}"
log_ok "MCP URL constructed: ${MCP_URL:0:60}..."

# Update Zed config
ZED_CONFIG="/home/manager/.var/app/dev.zed.Zed/config/zed/settings.json"
log_info "Updating Zed configuration at ${ZED_CONFIG}..."

if [ ! -f "$ZED_CONFIG" ]; then
  log_err "Zed config not found. Is Zed installed?"
  exit 1
fi

# Backup
cp "$ZED_CONFIG" "${ZED_CONFIG}.backup.$(date +%s)"
log_ok "Backup created: ${ZED_CONFIG}.backup.*"

# Update or create context_servers
if grep -q 'context_servers' "$ZED_CONFIG"; then
  # Update existing (replace windmill URL if exists)
  if grep -q '"windmill"' "$ZED_CONFIG"; then
    # Replace existing windmill entry
    sed -i "/\"windmill\": {[^}]*}/c\    \"windmill\": {\n      \"url\": \"${MCP_URL}\"\n    }" "$ZED_CONFIG"
  else
    # Insert new server into context_servers object
    sed -i '/context_servers": {/a\    "windmill": {\n      "url": "'"${MCP_URL}"'"\n    }' "$ZED_CONFIG"
  fi
  log_ok "Updated existing MCP configuration in Zed settings"
else
  # Create new context_servers block
  # Strategy: add before closing brace of JSON root
  # First, indent properly
  ENTRY="  \"context_servers\": {\n    \"windmill\": {\n      \"url\": \"${MCP_URL}\"\n    }\n  },"
  # Find where to insert (after last key-value before closing })
  # Use jq if available, else manual sed
  if command -v jq &>/dev/null; then
    TMP=$(mktemp)
    jq '. + {context_servers: {windmill: {url: "'"${MCP_URL}"'"}}}' "$ZED_CONFIG" > "$TMP" && mv "$TMP" "$ZED_CONFIG"
    log_ok "Added MCP configuration using jq"
  else
    # Manual JSON edit (risky but works for flat structure)
    # Find last } at root level
    sed -i '/^[[:space:]]*}/i\  "context_servers": {\n    "windmill": {\n      "url": "'"${MCP_URL}"'"\n    }\n  },' "$ZED_CONFIG"
    # Remove trailing comma from previous last entry (if any) - simplistic
    log_warn "Manually edited JSON; please verify syntax with jq or jsonlint"
  fi
fi

# Validate JSON
if command -v jq &>/dev/null; then
  if jq empty "$ZED_CONFIG" 2>/dev/null; then
    log_ok "Zed settings.json is valid JSON"
  else
    log_err "Zed settings.json is INVALID JSON"
    log_info "Restoring from backup..."
    cp "${ZED_CONFIG}.backup.*" "$ZED_CONFIG" 2>/dev/null || true
    exit 1
  fi
fi

log_ok "Zed configuration updated successfully"
log_info ""
log_info "=========================================="
log_info "  NEX TSTEPS"
log_info "=========================================="
log_info ""
log_info "1. Restart Zed (Ctrl+Q → restart)"
log_info "2. Look for MCP tools panel (left sidebar, plug icon)"
log_info "3. You should see 'windmill' server with tools list"
log_info "4. Test: type in Zed chat 'list my Windmill scripts'"
log_info ""
log_info "If tools don't appear, run:"
log_info "  bash scripts/verify-mcp.sh"
log_info ""
log_ok "Setup complete!"
