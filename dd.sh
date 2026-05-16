#!/usr/bin/env bash
# ============================================================================
# dd.sh - Stop Windmill stack with safe preflight checks and clear summary
# ============================================================================
set -euo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly DEFAULT_COMPOSE_FILE="docker-compose.windmill.yml"
readonly PORTS_TO_CHECK=(5432 6379 8080 25 8000 2525)

COMPOSE_FILE="$DEFAULT_COMPOSE_FILE"
REMOVE_VOLUMES=false
REMOVE_ORPHANS=false
ASSUME_YES=false
BACKUP_FILE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Stop Windmill services managed by Docker Compose.

OPTIONS:
  -v, --volumes          Remove named volumes too
  -r, --remove-orphans   Remove orphan containers too
  -f, --file FILE        Use a specific compose file
  -y, --yes              Skip confirmation when removing volumes
  -h, --help             Show this help

EXAMPLES:
  $SCRIPT_NAME
  $SCRIPT_NAME --volumes
  $SCRIPT_NAME --volumes --remove-orphans --yes
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
            -v|--volumes)
                REMOVE_VOLUMES=true
                ;;
            -r|--remove-orphans)
                REMOVE_ORPHANS=true
                ;;
            -f|--file)
                if [[ $# -lt 2 || -z "${2:-}" ]]; then
                    log_error "Missing value for --file"
                    exit 1
                fi
                COMPOSE_FILE="$2"
                shift
                ;;
            -y|--yes)
                ASSUME_YES=true
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

confirm_volume_removal() {
    if [[ "$REMOVE_VOLUMES" != true || "$ASSUME_YES" == true ]]; then
        return
    fi

    log_warn "This will remove persistent data:"
    log_warn "  - PostgreSQL database"
    log_warn "  - Redis state"
    log_warn "  - Worker caches and logs"
    echo
    read -r -p "Continue? [y/N]: " reply
    if [[ ! "$reply" =~ ^[Yy]$ ]]; then
        log_info "Operation cancelled"
        exit 0
    fi
}

has_running_stack() {
    [[ -n "$("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps -q 2>/dev/null)" ]]
}

maybe_backup_db() {
    if [[ "$REMOVE_VOLUMES" != true ]]; then
        return
    fi
    if ! has_running_stack; then
        log_info "No running stack detected; skipping backup"
        return
    fi
    if [[ -z "$("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps -q db 2>/dev/null)" ]]; then
        log_warn "DB container is not running; backup skipped"
        return
    fi

    BACKUP_FILE="backup_db_$(date +%Y%m%d_%H%M%S).sql"
    log_info "Creating database backup at $BACKUP_FILE"
    if "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" exec -T db pg_dump -U windmill windmill >"$BACKUP_FILE" 2>/dev/null; then
        log_ok "Backup created: $BACKUP_FILE"
        return
    fi

    rm -f "$BACKUP_FILE"
    BACKUP_FILE=""
    log_warn "Database backup could not be created; continuing shutdown"
}

shutdown_stack() {
    local -a down_args=(down)
    if [[ "$REMOVE_VOLUMES" == true ]]; then
        down_args+=(-v)
    fi
    if [[ "$REMOVE_ORPHANS" == true ]]; then
        down_args+=(--remove-orphans)
    fi

    log_step "Stopping services"
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" "${down_args[@]}"
    log_ok "Services stopped"
}

port_is_listening() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tuln 2>/dev/null | grep -q "[.:]${port}[[:space:]]"
        return
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -tuln 2>/dev/null | grep -q "[.:]${port}[[:space:]]"
        return
    fi
    return 1
}

post_checks() {
    local port
    log_info "Checking released ports"
    sleep 2
    for port in "${PORTS_TO_CHECK[@]}"; do
        if port_is_listening "$port"; then
            log_warn "Port $port is still in use"
        else
            log_ok "Port $port released"
        fi
    done
}

print_summary() {
    echo
    log_info "=== SUMMARY ==="
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Volumes removed: $REMOVE_VOLUMES"
    log_info "Orphans removed: $REMOVE_ORPHANS"
    if [[ -n "$BACKUP_FILE" ]]; then
        log_info "Backup file: $BACKUP_FILE"
    fi

    if has_running_stack; then
        log_warn "Some containers are still associated with the stack:"
        "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" ps || true
    else
        log_ok "No containers remain for this stack"
    fi

    if [[ "$REMOVE_VOLUMES" == true ]]; then
        log_warn "Named volumes were removed"
    fi
}

main() {
    parse_args "$@"
    preflight
    confirm_volume_removal
    maybe_backup_db
    shutdown_stack
    post_checks
    print_summary
}

main "$@"
