#!/usr/bin/env bash
# ============================================================================
# du.sh - Start Windmill stack with strict preflight and post-start checks
# ============================================================================
set -euo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly DEFAULT_COMPOSE_FILE="docker-compose.windmill.yml"
readonly DEFAULT_LOG_TAIL=80
readonly DEFAULT_WAIT_TIMEOUT=45
readonly CRITICAL_SERVICES=(db redis windmill_server)

COMPOSE_FILE="$DEFAULT_COMPOSE_FILE"
DETACH_REQUESTED=false
LOG_TAIL="$DEFAULT_LOG_TAIL"
WAIT_TIMEOUT="$DEFAULT_WAIT_TIMEOUT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Start Windmill services and report only actionable anomalies.

OPTIONS:
  -d, --detach           Compatibility flag; startup is detached by default
  -f, --file FILE        Use a specific compose file
  --tail N               Number of log lines to inspect after startup
  --wait-timeout SEC     Max seconds to wait for healthy startup when supported
  -h, --help             Show this help

EXAMPLES:
  $SCRIPT_NAME
  $SCRIPT_NAME --tail 120
  $SCRIPT_NAME --file docker-compose.windmill.yml
EOF
}

declare -a COMPOSE_CMD=()

init_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return
    fi
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
        return
    fi
    log_error "Docker Compose is not available"
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "${1:-}" in
            -d|--detach)
                DETACH_REQUESTED=true
                ;;
            -f|--file)
                if [[ $# -lt 2 || -z "${2:-}" ]]; then
                    log_error "Missing value for --file"
                    exit 1
                fi
                COMPOSE_FILE="$2"
                shift
                ;;
            --tail)
                if [[ $# -lt 2 || ! "${2:-}" =~ ^[0-9]+$ ]]; then
                    log_error "--tail requires a numeric value"
                    exit 1
                fi
                LOG_TAIL="$2"
                shift
                ;;
            --wait-timeout)
                if [[ $# -lt 2 || ! "${2:-}" =~ ^[0-9]+$ ]]; then
                    log_error "--wait-timeout requires a numeric value"
                    exit 1
                fi
                WAIT_TIMEOUT="$2"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
        shift
    done
}

preflight() {
    init_compose_cmd

    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not installed"
        exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not reachable"
        exit 1
    fi
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
}

compose_supports_wait() {
    "${COMPOSE_CMD[@]}" up --help 2>/dev/null | grep -q -- "--wait"
}

filter_strict() {
    awk '
        /unshare test command failed|Failed to install rustls crypto provider|oauth\.json not found|SMTP not configured|Redis does not require authentication/ { next }
        /bf-error-rate|server is listening only on the HTTP port, so no automatic HTTPS will be applied to this server/ { next }
        /cloudflared_tunnel/ && /context canceled|control stream encountered a failure while serving|Serve tunnel error|Connection terminated/ { next }
        tolower($0) ~ /error|fail|crit|alert|fatal|exception|warn|traceback/ && tolower($0) !~ /info|debug|notice/ {
            if (tolower($0) ~ /warn/) print "\033[1;33m[WARN]\033[0m " $0;
            else print "\033[0;31m[ERROR]\033[0m " $0;
        }
    '
}

cleanup_orphans() {
    log_info "Cleaning previous stack state"
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
}

start_stack() {
    local -a up_args=(up -d)
    if compose_supports_wait; then
        up_args+=(--wait --wait-timeout "$WAIT_TIMEOUT")
    fi

    if [[ "$DETACH_REQUESTED" == true ]]; then
        log_info "Detached startup requested"
    fi
    log_info "Starting services"
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" "${up_args[@]}"
}

container_status() {
    local service="$1"
    local container_id

    container_id="$("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null)"
    if [[ -z "$container_id" ]]; then
        printf '%s\n' "missing"
        return
    fi

    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null \
        || printf '%s\n' "unknown"
}

emit_recent_anomalies() {
    local logs
    local anomalies

    logs="$("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" logs --tail "$LOG_TAIL" 2>&1 || true)"
    anomalies="$(printf '%s\n' "$logs" | filter_strict || true)"

    if [[ -n "$anomalies" ]]; then
        echo
        log_warn "Recent anomalies detected"
        printf '%s\n' "$anomalies"
    fi
}

check_services() {
    local service
    local status
    local failures=0

    echo
    log_info "Critical service status"
    for service in "${CRITICAL_SERVICES[@]}"; do
        status="$(container_status "$service")"
        case "$status" in
            running|healthy)
                log_ok "$service: $status"
                ;;
            *)
                log_error "$service: $status"
                failures=$((failures + 1))
                ;;
        esac
    done

    return "$failures"
}

print_summary() {
    echo
    log_info "=== SUMMARY ==="
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Log tail inspected: $LOG_TAIL"
    if compose_supports_wait; then
        log_info "Startup wait timeout: ${WAIT_TIMEOUT}s"
    else
        log_warn "Compose does not support --wait; startup validation is post-check only"
    fi
}

main() {
    parse_args "$@"
    preflight
    cleanup_orphans
    start_stack
    emit_recent_anomalies
    if ! check_services; then
        print_summary
        exit 1
    fi
    print_summary
}

main "$@"
