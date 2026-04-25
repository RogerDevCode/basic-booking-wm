#!/usr/bin/env bash
# windmill-hardreset-local.sh — Destroy local Windmill state and bootstrap a clean workspace

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-booking-titanium-wm}"
LOCAL_PROFILE_NAME="${WM_LOCAL_PROFILE_NAME:-local-direct-8080}"
LOCAL_WORKSPACE_ID="${WM_LOCAL_WORKSPACE_ID:-booking-titanium}"
LOCAL_WORKSPACE_NAME="${WM_LOCAL_WORKSPACE_NAME:-Booking Titanium}"
LOCAL_BASE_URL="${WM_LOCAL_BASE_URL:-http://localhost:8080}"
LOCAL_ADMIN_EMAIL="${WM_LOCAL_ADMIN_EMAIL:-admin@windmill.dev}"
LOCAL_ADMIN_PASSWORD="${WM_LOCAL_ADMIN_PASSWORD:-changeme}"

DOWN_COMPOSE_ARGS=(-p "$COMPOSE_PROJECT_NAME" -f docker-compose.windmill.yml)
UP_COMPOSE_ARGS=(-p "$COMPOSE_PROJECT_NAME" -f docker-compose.windmill.yml)

if [ -f docker-compose.cloudflared.yml ]; then
  DOWN_COMPOSE_ARGS+=(-f docker-compose.cloudflared.yml)
  UP_COMPOSE_ARGS+=(-f docker-compose.cloudflared.yml)
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Missing required command: $1"
    exit 1
  fi
}

read_http_body() {
  tr -d '\r\n' <"$1"
}

http_request() {
  local method="$1"
  local url="$2"
  local output_file="$3"
  local data="${4:-}"
  shift 4 || true

  local curl_args=(
    -sS
    -o "$output_file"
    -w "%{http_code}"
    -X "$method"
    "$url"
  )

  if [ -n "$data" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  while [ "$#" -gt 0 ]; do
    curl_args+=(-H "$1")
    shift
  done

  curl "${curl_args[@]}"
}

wait_for_local_windmill() {
  local attempts=90
  local version_url="${LOCAL_BASE_URL}/api/version"

  for attempt in $(seq 1 "$attempts"); do
    if curl -sf "$version_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "❌ Windmill local did not become ready at ${version_url}"
  exit 1
}

remove_project_residue() {
  local container_ids
  local network_names
  local volume_names

  container_ids="$(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")"
  if [ -n "$container_ids" ]; then
    docker rm -f $container_ids >/dev/null 2>&1 || true
  fi

  volume_names="$(docker volume ls --format '{{.Name}}' | grep "^${COMPOSE_PROJECT_NAME}_" || true)"
  if [ -n "$volume_names" ]; then
    echo "$volume_names" | xargs -r docker volume rm -f >/dev/null
  fi

  network_names="$(docker network ls --format '{{.Name}}' | grep "^${COMPOSE_PROJECT_NAME}_" || true)"
  if [ -n "$network_names" ]; then
    echo "$network_names" | xargs -r docker network rm >/dev/null 2>&1 || true
  fi
}

bootstrap_admin_if_missing() {
  # Windmill automatically provisions the superadmin based on env vars.
  # The creation/exists endpoints now require auth and return 401.
  # We just assume the admin exists and proceed to login.
  return 0
}

login_local_admin() {
  local login_file
  local payload
  local http_code
  local token

  payload="$(printf '{"email":"%s","password":"%s"}' "$LOCAL_ADMIN_EMAIL" "$LOCAL_ADMIN_PASSWORD")"
  login_file="$(mktemp)"
  http_code="$(http_request "POST" "${LOCAL_BASE_URL}/api/auth/login" "$login_file" "$payload")"
  token="$(read_http_body "$login_file")"
  rm -f "$login_file"

  if [ "$http_code" != "200" ] || [ -z "$token" ]; then
    echo "❌ Unable to login to local Windmill as ${LOCAL_ADMIN_EMAIL} (HTTP ${http_code})"
    exit 1
  fi

  printf '%s' "$token"
}

configure_local_workspace() {
  local token="$1"

  wmill workspace add \
    "$LOCAL_PROFILE_NAME" \
    "$LOCAL_WORKSPACE_ID" \
    "$LOCAL_BASE_URL" \
    --token "$token" \
    --create \
    --create-workspace-name "$LOCAL_WORKSPACE_NAME" \
    --create-username admin \
    >/dev/null

  # Profile switch removed to avoid breaking production syncs
  # wmill workspace switch "$LOCAL_PROFILE_NAME" >/dev/null
}

main() {
  require_command docker
  require_command curl
  require_command wmill

  echo "🧨 Hard reset local de Windmill..."
  docker compose "${DOWN_COMPOSE_ARGS[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  remove_project_residue

  echo "🚀 Levantando stack limpio..."
  docker compose "${UP_COMPOSE_ARGS[@]}" up -d >/dev/null
  wait_for_local_windmill

  echo "🔐 Re-sembrando acceso local..."
  bootstrap_admin_if_missing
  configure_local_workspace "$(login_local_admin)"

  echo "✅ Windmill local limpio y operativo en ${LOCAL_BASE_URL}"
}

main "$@"
