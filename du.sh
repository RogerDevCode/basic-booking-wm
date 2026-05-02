#!/bin/bash
# du.sh - Silent Mode: Solo Alertas y Errores
set -euo pipefail

COMPOSE_FILE="docker-compose.windmill.yml"
DETACH=""

# Parser de argumentos
while [[ $# -gt 0 ]]; do
    case ${1:-} in
        -d|--detach) DETACH="-d" ;;
        -f|--file) COMPOSE_FILE="${2:-}"; shift ;;
        *) break ;;
    esac
    shift
done

# Silent Runner: Ejecuta y solo reporta si el exit code es != 0
run_silent() {
    if ! "$@" >/dev/null 2>&1; then
        echo -e "\033[0;31m[CRITICAL FAIL]\033[0m Error ejecutando: $*" >&2
        return 1
    fi
}

# Filtro de ruido total
filter_strict() {
    awk '
        /unshare test command failed|Failed to install rustls crypto provider|oauth\.json not found|SMTP not configured|Redis does not require authentication/ { next }
        tolower($0) ~ /error|fail|crit|alert|fatal|exception|warn/ && tolower($0) !~ /info|debug|notice/ {
            if (tolower($0) ~ /warn/) print "\033[1;33m[WARN]\033[0m " $0;
            else print "\033[0;31m[ERROR]\033[0m " $0;
        }
    '
}

# 1. Validaciones Pre-vuelo (Silenciosas)
run_silent command -v docker
run_silent docker info
run_silent test -f "$COMPOSE_FILE"

# 2. Limpieza Idempotente (Silenciosa)
docker compose -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true

# 3. Ejecución
if [[ "$DETACH" == "-d" ]]; then
    docker compose -f "$COMPOSE_FILE" up -d >/dev/null 2>&1
else
    # Si no es detach, enviamos a background para poder filtrar la salida
    docker compose -f "$COMPOSE_FILE" up >/dev/null 2>&1 &
    sleep 4
fi

# ========================================
# REPORTE DE ANOMALÍAS (Única salida)
# ========================================
LOGS=$(docker compose -f "$COMPOSE_FILE" logs --tail=50 2>&1)
ERRORS_FOUND=$(echo "$LOGS" | filter_strict)

if [[ -n "$ERRORS_FOUND" ]]; then
    echo -e "\n-- ANOMALÍAS DETECTADAS --"
    echo "$ERRORS_FOUND"
fi

# Verificación de nodos caídos (Caddy ignorado aquí por delay de healthcheck)
SERVICES=("db" "redis" "windmill_server")
for svc in "${SERVICES[@]}"; do
    STATE=$(docker compose -f "$COMPOSE_FILE" ps "$svc" --format json 2>/dev/null | grep -o '"State":"[^"]*"' | cut -d'"' -f4 || echo "missing")
    if [[ "$STATE" != "running" && "$STATE" != "healthy" ]]; then
        echo -e "\033[0;31m[OFFLINE]\033[0m $svc está en estado: $STATE"
    fi
done
