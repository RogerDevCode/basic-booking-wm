#!/bin/bash

# ==============================================================================
# LOCAL DEVELOPMENT SETUP SCRIPT
# ==============================================================================
# Configures Docker services (PostgreSQL, Redis) and validates the environment
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

# Check Node.js
log_info "Checking Node.js..."
if ! command -v node &> /dev/null; then
  log_error "Node.js not found. Please install Node.js 18+"
  exit 1
fi
log_success "Node.js $(node --version)"

# Check npm
log_info "Checking npm..."
if ! command -v npm &> /dev/null; then
  log_error "npm not found. Please install npm."
  exit 1
fi
log_success "npm $(npm --version)"

echo ""

# ==============================================================================
# DOCKER COMPOSE DEV SETUP
# ==============================================================================

log_info "Setting up Docker Compose development environment..."

cd docker-compose.dev

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  log_warn ".env not found, creating from .env.example..."
  cp .env.example .env
  log_success "Created .env in docker-compose.dev/"
  echo ""
  log_warn "⚠️  UPDATE THESE VALUES IN docker-compose.dev/.env:"
  echo "  - POSTGRES_PASSWORD (currently 'your_local_db_password')"
  echo "  - REDIS_PASSWORD (currently 'your_local_redis_password')"
  echo ""
fi

# Check if services are already running
log_info "Checking for existing containers..."
POSTGRES_RUNNING=$(docker-compose ps postgres 2>/dev/null | grep -i running || echo "")
REDIS_RUNNING=$(docker-compose ps redis 2>/dev/null | grep -i running || echo "")

if [ -z "$POSTGRES_RUNNING" ] || [ -z "$REDIS_RUNNING" ]; then
  log_info "Starting Docker services..."
  docker-compose up -d --build
  log_success "Docker services started"
  echo ""

  log_info "Waiting for PostgreSQL to be ready..."
  for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U $(grep POSTGRES_USER .env | cut -d'=' -f2) -d $(grep POSTGRES_DB .env | cut -d'=' -f2) &>/dev/null; then
      log_success "PostgreSQL is ready"
      break
    fi
    echo -n "."
    sleep 1
  done
  echo ""
else
  log_success "Docker services already running"
fi

# Get database URL
POSTGRES_USER=$(grep POSTGRES_USER .env | cut -d'=' -f2)
POSTGRES_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d'=' -f2)
POSTGRES_DB=$(grep POSTGRES_DB .env | cut -d'=' -f2)
POSTGRES_PORT=$(grep POSTGRES_PORT .env | cut -d'=' -f2)

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

log_info "Database configuration:"
echo "  Host: 127.0.0.1:${POSTGRES_PORT}"
echo "  User: ${POSTGRES_USER}"
echo "  Database: ${POSTGRES_DB}"

cd ..

# ==============================================================================
# ENVIRONMENT SETUP
# ==============================================================================

echo ""
log_info "Setting up Node.js environment..."

# Create .env if not exists (for tests)
if [ ! -f .env ]; then
  log_warn ".env not found in project root"
  log_info "Using DATABASE_URL from docker-compose.dev..."

  # For testing, we'll use a minimal .env
  cat > .env << EOF
# Local Development Database
DATABASE_URL=${DATABASE_URL}

# Redis (Local)
REDIS_URL=redis://127.0.0.1:6379

# LLM (Optional for local testing)
# GROQ_API_KEY=your_groq_key
# OPENAI_API_KEY=your_openai_key
EOF

  log_success "Created minimal .env for local development"
fi

# ==============================================================================
# DEPENDENCY INSTALLATION
# ==============================================================================

echo ""
log_info "Installing npm dependencies..."
npm install --silent
log_success "Dependencies installed"

# ==============================================================================
# VALIDATION
# ==============================================================================

echo ""
log_info "Validating TypeScript..."
npx tsc --noEmit --quiet
log_success "TypeScript validation passed"

# ==============================================================================
# TEST EXECUTION
# ==============================================================================

echo ""
log_info "Running test suite..."
npm test -- --run --reporter=verbose 2>&1 | tail -20
log_success "Tests completed"

# ==============================================================================
# SUCCESS SUMMARY
# ==============================================================================

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ BOOKING TITANIUM LOCAL SETUP COMPLETE${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
echo ""

echo "📊 Services Running:"
docker-compose -f docker-compose.dev/docker-compose.yml ps

echo ""
echo "🗄️  Database:"
echo "  PostgreSQL: postgresql://localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
echo ""

echo "📦 Quick Start Commands:"
echo "  npm test              # Run all tests"
echo "  npm test -- f/booking_create  # Run specific feature tests"
echo "  npm run typecheck     # TypeScript strict check"
echo "  npm run test:watch    # Watch mode"
echo ""

echo "🛠️  Docker Commands:"
echo "  cd docker-compose.dev"
echo "  docker-compose logs postgres  # View PostgreSQL logs"
echo "  docker-compose logs redis     # View Redis logs"
echo "  docker-compose down           # Stop services"
echo ""

echo "📚 Documentation:"
echo "  - CLAUDE.md    → Development guide"
echo "  - AGENTS.md    → Architecture rules"
echo "  - README.md    → Project overview"
echo ""

log_success "Ready for development! 🚀"
