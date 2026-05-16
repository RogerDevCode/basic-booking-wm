#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_WM_FILE="${PROJECT_ROOT}/.env.wm"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
if [ -f "${ENV_WM_FILE}" ]; then
  source "${ENV_WM_FILE}"
fi
set +a

if [ -z "${MCP_TOKEN:-}" ] && [ -n "${WM_TOKEN_URL:-}" ]; then
  MCP_TOKEN="${WM_TOKEN_URL##*token=}"
  export MCP_TOKEN
fi

if [ -z "${WM_BASE_URL:-}" ]; then
  echo "WM_BASE_URL is not set in ${ENV_FILE} or ${ENV_WM_FILE}" >&2
  exit 1
fi

if [ -z "${WORKSPACE_ID:-}" ]; then
  echo "WORKSPACE_ID is not set in ${ENV_WM_FILE}" >&2
  exit 1
fi

if [ -z "${MCP_TOKEN:-}" ]; then
  echo "MCP_TOKEN is not set in ${ENV_FILE}/${ENV_WM_FILE} and could not be extracted from WM_TOKEN_URL" >&2
  exit 1
fi

WM_BASE_URL_NORMALIZED="${WM_BASE_URL%/}"
MCP_URL="${WM_BASE_URL_NORMALIZED}/api/mcp/w/${WORKSPACE_ID}/mcp"

exec codex \
  -c "mcp_servers.windmill.url=\"${MCP_URL}\"" \
  -c 'mcp_servers.windmill.bearer_token_env_var="MCP_TOKEN"' \
  "$@"
