#!/bin/bash

# ============================================================================
# WINDMILL SCRIPTS - EXHAUSTIVE TEST RUNNER
# ============================================================================
# Este script ejecuta todos los tests para los scripts de Windmill
# 
# Uso: bash scripts/test_windmill_scripts.sh [options]
#
# Options:
#   -v, --verbose     Verbose output
#   -s, --short       Short test mode (skip integration tests)
#   -c, --coverage    Generate coverage report
#   -h, --help        Show help
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
VERBOSE=false
SHORT_MODE=false
COVERAGE=false
TEST_DIR="./tests/scripts"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -s|--short)
            SHORT_MODE=true
            shift
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose     Verbose output"
            echo "  -s, --short       Short test mode (skip integration tests)"
            echo "  -c, --coverage    Generate coverage report"
            echo "  -h, --help        Show help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  WINDMILL SCRIPTS - EXHAUSTIVE TEST SUITE${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Date: $(date)"
echo "Test Directory: $TEST_DIR"
echo ""

# Build flags
BUILD_FLAGS=""
if [ "$SHORT_MODE" = true ]; then
    BUILD_FLAGS="-short"
    echo -e "${YELLOW}Mode: SHORT (skipping integration tests)${NC}"
fi

if [ "$VERBOSE" = true ]; then
    BUILD_FLAGS="$BUILD_FLAGS -v"
    echo -e "${YELLOW}Mode: VERBOSE${NC}"
fi

# Check if test files exist
if [ ! -d "$TEST_DIR" ]; then
    echo -e "${RED}✗ Test directory not found: $TEST_DIR${NC}"
    exit 1
fi

TEST_COUNT=$(find "$TEST_DIR" -name "*_test.go" | wc -l)
echo "Found $TEST_COUNT test files"
echo ""

# ============================================================================
# PHASE 1: UNIT TESTS
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 1: UNIT TESTS${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Running unit tests..."
if go test $BUILD_FLAGS ./tests/scripts/... 2>&1; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo -e "${RED}✗ Unit tests failed${NC}"
    if [ "$SHORT_MODE" = false ]; then
        echo "Tip: Run with -s flag to skip integration tests"
    fi
    exit 1
fi

echo ""

# ============================================================================
# PHASE 2: COVERAGE (Optional)
# ============================================================================
if [ "$COVERAGE" = true ]; then
    echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  PHASE 2: COVERAGE REPORT${NC}"
    echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
    echo ""

    echo "Generating coverage report..."
    
    # Create coverage directory
    mkdir -p ./coverage
    
    # Generate coverage
    if go test -coverprofile=./coverage/coverage.out ./tests/scripts/... 2>&1; then
        echo -e "${GREEN}✓ Coverage report generated${NC}"
        
        # HTML report
        go tool cover -html=./coverage/coverage.out -o ./coverage/coverage.html
        echo "  HTML Report: ./coverage/coverage.html"
        
        # Text summary
        echo ""
        echo "Coverage Summary:"
        go tool cover -func=./coverage/coverage.out | tail -1
    else
        echo -e "${RED}✗ Coverage generation failed${NC}"
    fi
    
    echo ""
fi

# ============================================================================
# PHASE 3: SCRIPT VALIDATION
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 3: SCRIPT VALIDATION${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Validate each script compiles
SCRIPTS=(
    "f/booking_create/main.go"
    "f/booking_cancel/main.go"
    "f/booking_reschedule/main.go"
    "f/booking_orchestrator/main.go"
    "f/availability_check/main.go"
    "f/distributed_lock_acquire/main.go"
    "f/distributed_lock_release/main.go"
    "f/circuit_breaker_check/main.go"
    "f/circuit_breaker_record/main.go"
    "f/gcal_create_event/main.go"
    "f/gcal_delete_event/main.go"
    "f/gmail_send/main.go"
    "f/telegram_send/main.go"
    "f/get_providers/main.go"
    "f/get_services/main.go"
)

VALID_COUNT=0
INVALID_COUNT=0

for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        # Try to compile
        if go build -o /dev/null "$script" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $script"
            ((VALID_COUNT++))
        else
            echo -e "${RED}✗${NC} $script (compilation failed)"
            ((INVALID_COUNT++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} $script (not found)"
        ((INVALID_COUNT++))
    fi
done

echo ""
echo "Script Validation: $VALID_COUNT valid, $INVALID_COUNT issues"
echo ""

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $INVALID_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "Test Results:"
    echo "  ✓ Unit Tests: PASSED"
    if [ "$COVERAGE" = true ]; then
        echo "  ✓ Coverage Report: Generated"
    fi
    echo "  ✓ Script Validation: $VALID_COUNT/$VALID_COUNT valid"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  WINDMILL SCRIPTS - READY FOR DEPLOYMENT${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Issues Found:"
    echo "  Script Validation: $INVALID_COUNT scripts with issues"
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  FIX REQUIRED BEFORE DEPLOYMENT${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    exit 1
fi
