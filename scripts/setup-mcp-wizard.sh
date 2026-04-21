#!/usr/bin/env bash
#
# PRE-FLIGHT
# Mission          : Interactive MCP setup wizard for Zed (step-by-step)
# DB Tables        : None (reads only from config/env if available)
# Concurrency Risk : NO
# GCal Calls       : NO
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${CYAN}[STEP]${NC} $*"; }
log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()   { echo -e "${RED}[ERR]${NC} $*"; }

clear
echo "=========================================="
echo "  Windmill MCP Setup Wizard for Zed"
echo "  (Booking Titanium Project)"
echo "=========================================="
echo ""
log_info "This wizard will configure Zed editor to connect to your local Windmill MCP."
log_info "Prerequisites:"
log_info "  ✓ Docker stack running (docker compose up -d)"
log_info "  ✓ Windmill accessible at http://localhost:8080"
log_info "  ✓ Zed editor installed (v0.226+)"
log_info ""
read -p "Press ENTER to begin..."

# Step 1: Verify environment
log_step "Step 1/5: Verifying environment"
echo ""

if ! docker ps --format '{{.Names}}' | grep -q "booking-titanium-wm-windmill_server-1"; then
  log_err "Windmill server container not running!"
  log_info "Start it with: docker compose -f docker-compose.windmill.yml up -d"
  exit 1
fi
log_ok "Windmill server is running"

if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/version 2>/dev/null | grep -q "200"; then
  log_err "Windmill API not responding on port 8000"
  exit 1
fi
log_ok "Windmill API reachable on port 8000"

ZED_CONFIG="/home/manager/.var/app/dev.zed.Zed/config/zed/settings.json"
if [ ! -f "$ZED_CONFIG" ]; then
  log_err "Zed config not found: ${ZED_CONFIG}"
  log_info "Is Zed installed via Flatpak? Check: flatpak list | grep zed"
  exit 1
fi
log_ok "Zed config found"

# Step 2: Get workspace ID
log_step "Step 2/5: Workspace ID acquisition"
echo ""
log_info "Method A: Auto-detect from environment"
# Try to find workspace ID from project config
POSSIBLE_WIDS=(
  "$(grep -r "WORKSPACE_ID" "$HOME/.config/windmill" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '\"')"
  "$(grep -r "workspace" "${PROJECT_ROOT:-/home/manager/Sync/wildmill-proyects/booking-titanium-wm}/.env*" 2>/dev/null | grep -i id | head -1 | cut -d'=' -f2 | tr -d '\"')"
)

WORKSPACE_ID=""
for wid in "${POSSIBLE_WIDS[@]}"; do
  if echo "$wid" | grep -qE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
    WORKSPACE_ID="$wid"
    break
  fi
done

if [ -n "$WORKSPACE_ID" ]; then
  log_ok "Found workspace ID in config: ${WORKSPACE_ID}"
  read -p "Is this correct? (Y/n): " CONFIRM_WID
  if [[ "$CONFIRM_WID" =~ ^[Nn]$ ]]; then
    WORKSPACE_ID=""
  fi
fi

if [ -z "$WORKSPACE_ID" ]; then
  log_warn "Could not auto-detect workspace ID"
  echo ""
  log_info "Manual retrieval:"
  log_info "  1. Open browser → http://localhost:8080"
  log_info "  2. Login to Windmill (if first time, use admin credentials)"
  log_info "  3. Click Settings (gear icon) → Workspace → General"
  log_info "  4. Copy the 'Workspace ID' field (UUID format)"
  echo ""
  read -p "Paste Workspace ID now: " WORKSPACE_ID
  
  if [ -z "$WORKSPACE_ID" ]; then
    log_err "Workspace ID is required"
    exit 1
  fi
  
  # Validate UUID
  if ! echo "$WORKSPACE_ID" | grep -qE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
    log_warn "Workspace ID doesn't match UUID format: ${WORKSPACE_ID}"
    read -p "Continue anyway? (y/N): " CONT
    if [[ ! "$CONT" =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
  log_ok "Workspace ID accepted: ${WORKSPACE_ID}"
fi

# Step 3: Token generation
log_step "Step 3/5: MCP Token generation"
echo ""
log_info "Method: You will generate the MCP token via Windmill UI"
log_info "The admin token exists in project (.env.wm) but MCP token needs explicit creation."
echo ""
log_info "Open browser → http://localhost:8080 → Settings → Tokens"
log_info ""
read -p "Have you already generated an MCP token? (y/N): " HAS_TOKEN

if [[ "$HAS_TOKEN" =~ ^[Yy]$ ]]; then
  log_info "Paste the FULL MCP URL (includes token):"
  log_info "  Format: http://localhost:8000/api/mcp/w/<workspace_id>/mcp?token=<mcp_token>"
  read -p "MCP URL: " MCP_URL
else
  log_info "Please follow these steps in the browser:"
  log_info "  1. Settings (gear) → Tokens"
  log_info "  2. Enable toggle: 'Generate MCP URL'"
  log_info "  3. Select scope: 'All' (recommended)"
  log_info "  4. Click 'Generate MCP URL'"
  log_info "  5. Copy the displayed URL"
  echo ""
  read -p "Paste the generated MCP URL here: " MCP_URL
fi

if [ -z "$MCP_URL" ]; then
  log_err "MCP URL is required"
  exit 1
fi

# Validate URL format
if ! echo "$MCP_URL" | grep -qE '^http://.*/api/mcp/w/[^/]+/mcp\?token='; then
  log_err "Invalid MCP URL format. Expected: http://host/api/mcp/w/{workspace_id}/mcp?token={token}"
  exit 1
fi
log_ok "MCP URL format validated"

# Extract token for display
MCP_TOKEN_EXTRACTED=$(echo "$MCP_URL" | grep -oP '\?token=\K[^&]+' || echo "")
if [ -n "$MCP_TOKEN_EXTRACTED" ]; then
  log_ok "Token extracted (${#MCP_TOKEN_EXTRACTED} chars)"
fi

# Step 4: Update Zed config
log_step "Step 4/5: Updating Zed configuration"
echo ""
BACKUP="${ZED_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ZED_CONFIG" "$BACKUP"
log_ok "Backup saved: ${BACKUP}"

# Use jq to safely update
if command -v jq &>/dev/null; then
  # Ensure context_servers exists with windmill entry
  UPDATED=$(jq --arg url "$MCP_URL" '
    .context_servers.windmill.url = $url
    | .context_servers
  ' "$ZED_CONFIG" 2>/dev/null || echo '{}')
  
  if [ "$(echo "$UPDATED" | jq 'has("windmill")' 2>/dev/null || echo "false")" = "true" ]; then
    # Merge back
    jq --argjson servers "$UPDATED" '.context_servers = $servers' "$ZED_CONFIG" > "${ZED_CONFIG}.tmp" && mv "${ZED_CONFIG}.tmp" "$ZED_CONFIG"
    log_ok "Zed config updated (existing context_servers modified)"
  else
    # Create new context_servers
    jq --arg url "$MCP_URL" '. + {context_servers: {windmill: {url: $url}}}' "$ZED_CONFIG" > "${ZED_CONFIG}.tmp" && mv "${ZED_CONFIG}.tmp" "$ZED_CONFIG"
    log_ok "Zed config updated (new context_servers created)"
  fi
  
  # Verify JSON valid
  if jq empty "$ZED_CONFIG" 2>/dev/null; then
    log_ok "Zed settings.json is valid JSON"
  else
    log_err "Updated config is invalid JSON - restoring backup"
    cp "$BACKUP" "$ZED_CONFIG"
    exit 1
  fi
else
  log_warn "jq not installed, using sed (less safe)"
  # Simple sed-based replacement/insertion
  if grep -q 'context_servers' "$ZED_CONFIG"; then
    if grep -q '"windmill"' "$ZED_CONFIG"; then
      sed -i "/\"windmill\": {[^}]*}/c\    \"windmill\": {\n      \"url\": \"${MCP_URL}\"\n    }" "$ZED_CONFIG"
    else
      sed -i '/context_servers": {/a\    "windmill": {\n      "url": "'"${MCP_URL}"'"\n    }' "$ZED_CONFIG"
    fi
  else
    sed -i '/^}/i\  "context_servers": {\n    "windmill": {\n      "url": "'"${MCP_URL}"'"\n    }\n  },' "$ZED_CONFIG"
  fi
  log_warn "Manual edit completed - please verify JSON structure"
fi

log_ok "Zed configuration saved"

# Step 5: Validation
log_step "Step 5/5: Connectivity validation"
echo ""
log_info "Testing MCP endpoint with provided token..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MCP_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  log_ok "MCP endpoint reachable (HTTP ${HTTP_CODE})"
else
  log_warn "Unexpected HTTP code: ${HTTP_CODE}"
  log_info "This may indicate network issue or token invalid"
fi

# Try MCP initialize (JSON-RPC)
log_info "Sending MCP initialize request..."
INIT_RESP=$(curl -s -X POST "$(dirname "$MCP_URL")/mcp" \
  -H "Authorization: Bearer ${MCP_TOKEN_EXTRACTED:-dummy}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"zed-test","version":"1.0"}},"id":1}' 2>/dev/null || echo "{}")

if echo "$INIT_RESP" | grep -q '"result"'; then
  log_ok "MCP server responded to initialize"
else
  ERR_CODE=$(echo "$INIT_RESP" | grep -oP '"code"\s*:\s*\K[0-9]+' || echo "?")
  log_warn "Initialize returned error code: ${ERR_CODE}"
  log_info "This may be normal if token lacks proper scopes"
fi

# Summary
echo ""
log_ok "=== MCP Setup Complete ==="
echo ""
log_info "Next actions:"
echo "  1. Restart Zed completely (Ctrl+Q → restart)"
echo "  2. Open the MCP tools panel (left sidebar, plug icon)"
echo "  3. Verify 'windmill' server is listed"
echo "  4. Test in Zed chat: 'list my Windmill scripts'"
echo ""
log_info "If issues occur:"
echo "  - Run: bash scripts/verify-mcp.sh (health check)"
echo "  - Run: bash scripts/test-mcp-handshake.sh (full validation)"
echo "  - Check Zed developer console (Help → Toggle Developer Tools)"
echo ""
log_info "Your MCP URL (keep secret):"
log_info "  ${MCP_URL}"
echo ""
log_warn "⚠️  Treat this token like a password. Never commit it to git."
echo ""
log_info "Configuration file: ${ZED_CONFIG}"
log_info "Backup file:      ${BACKUP}"
