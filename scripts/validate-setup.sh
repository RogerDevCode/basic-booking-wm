#!/bin/bash

# ==============================================================================
# VALIDATION SCRIPT - Verify Local Setup
# ==============================================================================
# Validates that all services are running and properly configured
# Usage: ./scripts/validate-setup.sh
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECKS_PASSED=0
CHECKS_FAILED=0

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((CHECKS_PASSED++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((CHECKS_FAILED++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# ==============================================================================
# DOCKER VALIDATION
# ==============================================================================

echo -e "${BLUE}📦 DOCKER SERVICES${NC}"
echo ""

# PostgreSQL
if docker ps --filter "name=booking-dev-db" --format "{{.State}}" | grep -q "running"; then
  check_pass "PostgreSQL container is running"

  # Test connection
  POSTGRES_USER=$(grep POSTGRES_USER docker-compose.dev/.env 2>/dev/null | cut -d'=' -f2 || echo "unknown")
  POSTGRES_DB=$(grep POSTGRES_DB docker-compose.dev/.env 2>/dev/null | cut -d'=' -f2 || echo "unknown")

  if docker exec booking-dev-db pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} &>/dev/null; then
    check_pass "PostgreSQL is accepting connections"
  else
    check_fail "PostgreSQL connection check failed"
  fi
else
  check_fail "PostgreSQL container is NOT running"
fi

# Redis
if docker ps --filter "name=booking-dev-redis" --format "{{.State}}" | grep -q "running"; then
  check_pass "Redis container is running"

  # Test connection
  if docker exec booking-dev-redis redis-cli ping &>/dev/null | grep -q "PONG"; then
    check_pass "Redis is responding to PING"
  else
    check_fail "Redis connection check failed"
  fi
else
  check_fail "Redis container is NOT running"
fi

echo ""

# ==============================================================================
# ENVIRONMENT VALIDATION
# ==============================================================================

echo -e "${BLUE}⚙️  ENVIRONMENT CONFIGURATION${NC}"
echo ""

# Check root .env
if [ -f .env ]; then
  check_pass ".env file exists"

  # Check for DATABASE_URL
  if grep -q "DATABASE_URL" .env; then
    check_pass "DATABASE_URL is configured"
  else
    check_warn "DATABASE_URL not found in .env"
  fi
else
  check_fail ".env file NOT found"
fi

# Check docker-compose.dev/.env
if [ -f docker-compose.dev/.env ]; then
  check_pass "docker-compose.dev/.env exists"
else
  check_warn "docker-compose.dev/.env NOT found"
fi

echo ""

# ==============================================================================
# NODE.JS VALIDATION
# ==============================================================================

echo -e "${BLUE}📦 NODE.JS & DEPENDENCIES${NC}"
echo ""

# Node version
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  check_pass "Node.js ${NODE_VERSION} installed"
else
  check_fail "Node.js NOT found"
fi

# npm version
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  check_pass "npm ${NPM_VERSION} installed"
else
  check_fail "npm NOT found"
fi

# Dependencies installed
if [ -d node_modules ]; then
  check_pass "node_modules directory exists"
else
  check_warn "node_modules NOT found (run npm install)"
fi

echo ""

# ==============================================================================
# TYPESCRIPT VALIDATION
# ==============================================================================

echo -e "${BLUE}🔷 TYPESCRIPT${NC}"
echo ""

# TypeScript compilation
if npx tsc --noEmit --quiet 2>/dev/null; then
  check_pass "TypeScript compilation successful"
else
  check_fail "TypeScript compilation FAILED"
fi

# ESLint
if npx eslint 'f/**/*.ts' --max-warnings 0 &>/dev/null 2>&1; then
  check_pass "ESLint validation passed"
else
  check_warn "ESLint found issues (run npx eslint 'f/**/*.ts')"
fi

echo ""

# ==============================================================================
# TESTS VALIDATION
# ==============================================================================

echo -e "${BLUE}🧪 TESTS${NC}"
echo ""

# Test suite
if npm test -- --run --reporter=quiet &>/dev/null 2>&1; then
  TEST_COUNT=$(npm test -- --run 2>&1 | grep -E "Tests\s+[0-9]+" | head -1 || echo "")
  if [ -n "$TEST_COUNT" ]; then
    check_pass "Test suite: $TEST_COUNT"
  else
    check_pass "Test suite ran successfully"
  fi
else
  check_warn "Some tests may have failed (run npm test for details)"
fi

echo ""

# ==============================================================================
# SUMMARY
# ==============================================================================

TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED))

echo -e "${BLUE}═════════════════════════════════════════════════════════════════${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL CHECKS PASSED (${CHECKS_PASSED}/${TOTAL_CHECKS})${NC}"
  echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Your local environment is properly configured! 🚀"
  echo ""
  echo "Next steps:"
  echo "  1. Start coding: edit files in f/ directory"
  echo "  2. Run tests: npm test"
  echo "  3. Check type-safety: npm run typecheck"
  echo ""
  exit 0
else
  echo -e "${RED}✗ SOME CHECKS FAILED (${CHECKS_PASSED}/${TOTAL_CHECKS})${NC}"
  echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Issues found:"
  echo ""
  echo "  If Docker services aren't running:"
  echo "    cd docker-compose.dev && docker-compose up -d"
  echo ""
  echo "  If dependencies aren't installed:"
  echo "    npm install"
  echo ""
  echo "  If .env is missing:"
  echo "    cp .env.example .env"
  echo "    # Update with your API keys"
  echo ""
  exit 1
fi
