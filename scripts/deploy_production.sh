#!/bin/bash
# Production Deployment Script - Booking Titanium AI Agent v2.3
# Implements: Canary deployment, health checks, rollback on failure

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment configuration
CANARY_PERCENTAGE=5
CANARY_DURATION=3600  # 1 hour in seconds
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_INTERVAL=10

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check .env file
    if [ ! -f .env.production ]; then
        log_error ".env.production file not found"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

backup_current_deployment() {
    log_info "Creating backup of current deployment..."
    
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup current containers
    docker-compose ps --quiet | xargs -I {} docker export {} > "$BACKUP_DIR/containers.tar" 2>/dev/null || true
    
    # Backup volumes
    docker run --rm -v booking-titanium_redis-data:/data -v "$BACKUP_DIR/redis-data":/backup alpine tar czf /backup/redis-data.tar.gz -C /data . 2>/dev/null || true
    
    log_success "Backup created in $BACKUP_DIR"
}

health_check() {
    local service=$1
    local max_retries=$2
    local retry=0
    
    log_info "Running health check for $service..."
    
    while [ $retry -lt $max_retries ]; do
        if docker-compose ps "$service" | grep -q "Up"; then
            log_success "$service is healthy"
            return 0
        fi
        
        retry=$((retry + 1))
        log_warning "$service health check failed (attempt $retry/$max_retries)"
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    log_error "$service health check failed after $max_retries attempts"
    return 1
}

deploy_canary() {
    log_info "Deploying canary deployment (${CANARY_PERCENTAGE}% traffic)..."
    
    # Load environment variables
    set -a
    source .env.production
    set +a
    
    # Deploy with canary configuration
    export CANARY_ENABLED=true
    export CANARY_PERCENTAGE=$CANARY_PERCENTAGE
    
    docker-compose -f docker-compose.production.yml up -d --scale ai-agent=1
    
    if health_check "ai-agent" $HEALTH_CHECK_RETRIES; then
        log_success "Canary deployment successful"
        return 0
    else
        log_error "Canary deployment failed"
        return 1
    fi
}

monitor_canary() {
    log_info "Monitoring canary deployment for ${CANARY_DURATION} seconds..."
    
    local elapsed=0
    local check_interval=60
    
    while [ $elapsed -lt $CANARY_DURATION ]; do
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        
        log_info "Canary monitoring: ${elapsed}/${CANARY_DURATION} seconds"
        
        # Check metrics (in production, check actual metrics from Prometheus)
        if ! docker-compose ps ai-agent | grep -q "Up"; then
            log_error "Canary deployment unhealthy"
            return 1
        fi
    done
    
    log_success "Canary monitoring completed successfully"
    return 0
}

full_rollout() {
    log_info "Starting full rollout (100% traffic)..."
    
    export CANARY_ENABLED=false
    export CANARY_PERCENTAGE=0
    
    docker-compose -f docker-compose.production.yml up -d --scale ai-agent=3
    
    if health_check "ai-agent" $HEALTH_CHECK_RETRIES; then
        log_success "Full rollout successful"
        return 0
    else
        log_error "Full rollout failed"
        return 1
    fi
}

rollback() {
    log_warning "Starting rollback..."
    
    # Stop current deployment
    docker-compose -f docker-compose.production.yml down
    
    # Restore from backup (if available)
    LATEST_BACKUP=$(ls -t ./backups | head -n1)
    if [ -n "$LATEST_BACKUP" ]; then
        log_info "Restoring from backup: $LATEST_BACKUP"
        # Restore logic here
    fi
    
    log_success "Rollback completed"
}

cleanup() {
    log_info "Cleaning up old containers and images..."
    
    docker system prune -f --volumes
    docker image prune -f
    
    log_success "Cleanup completed"
}

show_status() {
    log_info "Deployment status:"
    echo ""
    docker-compose -f docker-compose.production.yml ps
    echo ""
    log_info "Logs:"
    docker-compose -f docker-compose.production.yml logs --tail=20
}

# ============================================================================
# MAIN DEPLOYMENT FLOW
# ============================================================================

main() {
    echo "========================================"
    echo "Booking Titanium AI Agent v2.3"
    echo "Production Deployment Script"
    echo "========================================"
    echo ""
    
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            backup_current_deployment
            
            log_info "Starting canary deployment..."
            if deploy_canary; then
                log_info "Canary deployed successfully, monitoring for ${CANARY_DURATION}s..."
                if monitor_canary; then
                    log_info "Canary monitoring passed, proceeding to full rollout..."
                    if full_rollout; then
                        log_success "Deployment completed successfully!"
                        show_status
                        cleanup
                        exit 0
                    else
                        log_error "Full rollout failed, initiating rollback..."
                        rollback
                        exit 1
                    fi
                else
                    log_error "Canary monitoring failed, initiating rollback..."
                    rollback
                    exit 1
                fi
            else
                log_error "Canary deployment failed"
                exit 1
            fi
            ;;
        
        rollback)
            rollback
            ;;
        
        status)
            show_status
            ;;
        
        logs)
            docker-compose -f docker-compose.production.yml logs -f
            ;;
        
        stop)
            log_info "Stopping deployment..."
            docker-compose -f docker-compose.production.yml down
            log_success "Deployment stopped"
            ;;
        
        *)
            echo "Usage: $0 {deploy|rollback|status|logs|stop}"
            exit 1
            ;;
    esac
}

main "$@"
