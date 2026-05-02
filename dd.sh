#!/bin/bash
# ============================================================================
# dd.sh - Docker Compose DOWN con validaciones inteligentes
# ============================================================================
set -e

ERRORS=0

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; ((ERRORS++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*"; }

# Usage
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Detener servicios Windmill via docker-compose.

OPTIONS:
    -v, --volumes   Eliminar también volúmenes (datos)
    -r, --remove    Eliminar contenedores también
    -f, --file FILE Archivo compose específico
    -h, --help      Mostrar esta ayuda

EJEMPLOS:
    $(basename "$0")              # Solo stop
    $(basename "$0") -v          # Eliminar datos también
    $(basename "$0") -r -v       # Full cleanup
EOF
}

# Parse args
COMPOSE_FILE="docker-compose.windmill.yml"
VOLUMES=""
REMOVE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--volumes) VOLUMES="-v" ;;
        -r|--remove) REMOVE="--remove-orphans" ;;
        -f|--file) COMPOSE_FILE="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        -*) log_error "Opción desconocida: $1"; usage; exit 1 ;;
    esac
    shift
done

# ========================================
# PRE-FLIGHT CHECKS
# ========================================

log_info "Validando estado actual..."

# Verificar docker-compose disponible
if command -v docker compose &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    log_error "docker-compose no está instalado"
    exit 1
fi

# Verificar archivo compose
if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Archivo compose no encontrado: $COMPOSE_FILE"
    exit 1
fi

# ========================================
# CONFIRMACIÓN SI HAY DATOS
# ========================================

if [[ -n "$VOLUMES" ]]; then
    log_warn "¡ADVERTENCIA! Se eliminarán TODOS los datos:"
    log_warn "  - Base de datos PostgreSQL"
    log_warn "  - Caché de workers"
    log_warn "  - Índices de búsqueda"
    log_warn "  - Logs"
    echo
    read -p "¿Continuar? [s/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        log_info "Operación cancelada"
        exit 0
    fi
fi

# ========================================
# BACKUP PRE-CAUTION (si hay volúmenes)
# ========================================

if [[ -n "$VOLUMES" ]] && $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps &> /dev/null; then
    log_info "Intentando backup de volúmenes..."
    
    # Backup de db
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T db pg_dump -U windmill windmill > "backup_db_$(date +%Y%m%d_%H%M%S).sql" 2>/dev/null; then
        log_ok "Backup DB creado: backup_db_*.sql"
    else
        log_warn "No se pudo crear backup (servicio db no disponible)"
    fi
fi

# ========================================
# STOP SERVICIOS
# ========================================

log_step "Deteniendo servicios..."
echo

# Forzar limpieza de networks huérfanas primero
log_info "Limpiando networks huérfanas..."
$DOCKER_COMPOSE -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

if [[ -n "$REMOVE" ]]; then
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down $VOLUMES --remove-orphans
else
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down $VOLUMES
fi

log_ok "Servicios detenidos"

# ========================================
# LIMPIEZA POST-SHUTDOWN
# ========================================

# Verificar puertos liberados
log_info "Verificando liberación de puertos..."
sleep 2

PORTS=(5432 6379 8080 25 8000 2525)
for port in "${PORTS[@]}"; do
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        log_warn "Puerto $port aún en uso (proceso zombie?)"
    else
        log_ok "Puerto $port liberado"
    fi
done

# Limpiar orphan containers si hay
ORPHANS=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -a 2>/dev/null | grep -c "Orphan" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [[ -n "$ORPHANS" && "$ORPHANS" =~ ^[0-9]+$ && "$ORPHANS" -gt 0 ]]; then
    log_warn "Contenedores huerfanos detectados: $ORPHANS"
    log_info "Limpiando..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" rm -f 2>/dev/null || true
fi

# ========================================
# RESUMEN
# ========================================

echo
log_info "=== RESUMEN ==="
$DOCKER_COMPOSE -f "$COMPOSE_FILE" ps

if [[ -n "$VOLUMES" ]]; then
    log_warn "Volúmenes eliminados - los datos no se pueden recuperar"
fi

log_ok "Despegue completado"

exit 0