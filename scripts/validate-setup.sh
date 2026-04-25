#!/bin/bash

# ==============================================================================
# VALIDATION SCRIPT - Verify Local Setup (Python Edition)
# ==============================================================================
# Validates that all services are running and properly configured for Python dev
# Usage: ./scripts/validate-setup.sh
# ==============================================================================

export PYTHONPATH=$PYTHONPATH:.

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

# Check container names (using flexible matching)
if docker ps --format "{{.Names}}" | grep -qE "db|postgres"; then
  check_pass "Database container is running"
else
  check_fail "Database container is NOT running"
fi

if docker ps --format "{{.Names}}" | grep -qE "redis"; then
  check_pass "Redis container is running"
else
  check_warn "Redis container NOT found"
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
  if grep -q "DATABASE_URL" .env; then
    check_pass "DATABASE_URL is configured"
  else
    check_warn "DATABASE_URL not found in .env"
  fi
else
  check_fail ".env file NOT found"
fi

echo ""

# ==============================================================================
# PYTHON VALIDATION
# ==============================================================================

echo -e "${BLUE}🐍 PYTHON & DEPENDENCIES${NC}"
echo ""

# Python version
if command -v python3 &> /dev/null; then
  PY_VERSION=$(python3 --version)
  check_pass "Python ${PY_VERSION} installed"
else
  check_fail "Python 3 NOT found"
fi

# uv version
if command -v uv &> /dev/null; then
  UV_VERSION=$(uv --version)
  check_pass "uv ${UV_VERSION} installed"
else
  check_fail "uv NOT found"
fi

# ==============================================================================
# CODE QUALITY VALIDATION
# ==============================================================================

echo -e "${BLUE}🛡️  CODE QUALITY & TYPES${NC}"
echo ""

# Mypy check (non-strict for validation summary to avoid failing on known stubs issues)
if uv run mypy f/booking_create/main.py &>/dev/null 2>&1; then
  check_pass "Mypy validation passed"
else
  check_warn "Mypy found some type issues (run: uv run mypy --strict f/)"
fi

# Ruff check
if uv run ruff check . &>/dev/null 2>&1; then
  check_pass "Ruff linting passed"
else
  check_warn "Ruff found linting issues (run: uv run ruff check --fix .)"
fi

echo ""

# ==============================================================================
# TESTS VALIDATION
# ==============================================================================

echo -e "${BLUE}🧪 TESTS${NC}"
echo ""

# Test suite (run a few critical ones)
if uv run pytest tests/py/booking_create/test_contract.py -q &>/dev/null 2>&1; then
  check_pass "Core contract tests passing"
else
  check_fail "Contract tests FAILED (run: export PYTHONPATH=. && uv run pytest tests/py/)"
fi

echo ""

# ==============================================================================
# SUMMARY
# ==============================================================================

TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED))

echo -e "${BLUE}═════════════════════════════════════════════════════════════════${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL CRITICAL CHECKS PASSED (${CHECKS_PASSED}/${TOTAL_CHECKS})${NC}"
  echo -e "${GREEN}═════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Your local environment is properly configured! 🚀"
  echo ""
  exit 0
else
  echo -e "${RED}✗ SOME CHECKS FAILED (${CHECKS_PASSED}/${TOTAL_CHECKS})${NC}"
  echo -e "${RED}═════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Issues found. Please run ./scripts/setup-local.sh to fix."
  echo ""
  exit 1
fi
