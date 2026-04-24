#!/bin/bash

# ==============================================================================
# LOCAL DEVELOPMENT SETUP SCRIPT (Python Edition)
# ==============================================================================
# Configures Docker services and validates the Python environment
# Usage: ./scripts/setup-local.sh
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# ==============================================================================
# VERIFICATION PHASE
# ==============================================================================

log_info "=== BOOKING TITANIUM LOCAL SETUP ==="
echo ""

# Check Docker
log_info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
  log_error "Docker not found. Please install Docker first."
  exit 1
fi
log_success "Docker $(docker --version | awk '{print $3}' | cut -d',' -f1)"

# Check Docker Compose
log_info "Checking Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
  log_error "Docker Compose not found. Please install Docker Compose."
  exit 1
fi
log_success "Docker Compose $(docker-compose --version | awk '{print $3}' | cut -d',' -f1)"

# Check Python
log_info "Checking Python..."
if ! command -v python3 &> /dev/null; then
  log_error "Python 3 not found. Please install Python 3.11+"
  exit 1
fi
log_success "Python $(python3 --version)"

# Check uv
log_info "Checking uv..."
if ! command -v uv &> /dev/null; then
  log_error "uv not found. Please install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi
log_success "uv $(uv --version)"

echo ""

# ==============================================================================
# DOCKER COMPOSE DEV SETUP
# ==============================================================================

log_info "Setting up Docker Compose development environment..."

# Note: Adjust directory if it was renamed or remains docker-compose.dev
if [ -d docker-compose.dev ]; then
  cd docker-compose.dev
  
  # Create .env if it doesn't exist
  if [ ! -f .env ]; then
    log_warn ".env not found, creating from .env.example..."
    cp .env.example .env
    log_success "Created .env in docker-compose.dev/"
    echo ""
    log_warn "⚠️  UPDATE THESE VALUES IN docker-compose.dev/.env:"
    echo "  - POSTGRES_PASSWORD"
    echo "  - REDIS_PASSWORD"
    echo ""
  fi

  # Start services
  log_info "Starting Docker services..."
  docker-compose up -d
  log_success "Docker services started"
  
  cd ..
else
  log_warn "docker-compose.dev directory not found, skipping container start"
fi

# ==============================================================================
# ENVIRONMENT SETUP
# ==============================================================================

echo ""
log_info "Setting up Python environment..."

# Create .env if not exists
if [ ! -f .env ]; then
  log_warn ".env not found in project root"
  cp .env.example .env 2>/dev/null || touch .env
  log_success "Created .env for local development"
fi

# ==============================================================================
# DEPENDENCY INSTALLATION
# ==============================================================================

echo ""
log_info "Installing Python dependencies via uv..."
uv sync
log_success "Dependencies synchronized"

# ==============================================================================
# VALIDATION
# ==============================================================================

echo ""
log_info "Validating Codebase (Type checking)..."
uv run mypy --strict f/
log_success "Mypy strict check passed"

# ==============================================================================
# TEST EXECUTION
# ==============================================================================

echo ""
log_info "Running Python test suite..."
uv run pytest tests/py/ -v | tail -5
log_success "Tests completed"

# ==============================================================================
# SUCCESS SUMMARY
# ==============================================================================

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ BOOKING TITANIUM LOCAL SETUP COMPLETE${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "📦 Quick Start Commands:"
echo "  uv run pytest tests/py/  # Run all tests"
echo "  uv run mypy --strict f/  # Type checking"
echo "  uv run ruff check .      # Linting"
echo ""

echo "📚 Documentation:"
echo "  - AGENTS.md    → Architecture rules (§PY)"
echo "  - README.md    → Project overview"
echo ""

log_success "Ready for development! 🚀"
