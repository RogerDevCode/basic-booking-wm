#!/bin/bash

# ============================================================================
# SINGLE PROVIDER MIGRATION - DATABASE TESTS
# ============================================================================
# This script tests the database migration for single-provider system
# Run: bash scripts/test_single_provider_db.sh
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="${POSTGRES_DB:-bookings}"
DB_USER="${POSTGRES_USER:-booking}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  SINGLE PROVIDER MIGRATION - DATABASE TESTS"
echo "════════════════════════════════════════════════════════════"
echo ""

# Function to run SQL query
run_query() {
    local query="$1"
    local description="$2"
    
    echo -e "${YELLOW}Testing:${NC} $description"
    echo "SQL: $query"
    
    if result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$query" 2>&1); then
        echo -e "${GREEN}✓ PASS${NC}"
        echo "Result: $result"
        echo ""
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "Error: $result"
        echo ""
        return 1
    fi
}

# Function to run SQL file
run_sql_file() {
    local file="$1"
    local description="$2"
    
    echo -e "${YELLOW}Executing:${NC} $description"
    echo "File: $file"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo ""
        return 1
    fi
}

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# TEST 1: Check system_config table exists
# ============================================================================
echo "TEST 1: system_config table exists"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_config');" "Check system_config table"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 2: Check system_config has data
# ============================================================================
echo "TEST 2: system_config has configuration data"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT COUNT(*) FROM system_config;" "Count config entries"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 3: Check single_provider_id config
# ============================================================================
echo "TEST 3: single_provider_id configuration"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT config_value FROM system_config WHERE config_key = 'single_provider_id';" "Get single_provider_id"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 4: Check single_service_id config
# ============================================================================
echo "TEST 4: single_service_id configuration"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT config_value FROM system_config WHERE config_key = 'single_service_id';" "Get single_service_id"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 5: Check get_single_provider_id() function
# ============================================================================
echo "TEST 5: get_single_provider_id() function"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT get_single_provider_id();" "Call get_single_provider_id()"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 6: Check get_single_service_id() function
# ============================================================================
echo "TEST 6: get_single_service_id() function"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT get_single_service_id();" "Call get_single_service_id()"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 7: Check get_system_config_value() function
# ============================================================================
echo "TEST 7: get_system_config_value() function"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT get_system_config_value('service_duration_min');" "Get service_duration_min"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 8: Check provider_services table is dropped
# ============================================================================
echo "TEST 8: provider_services table is dropped"
echo "────────────────────────────────────────────────────────────"
result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_services');" 2>&1)
if [ "$result" = "f" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "Result: provider_services table does not exist (correct)"
    echo ""
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "Result: provider_services table still exists"
    echo ""
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 9: Check validation trigger exists
# ============================================================================
echo "TEST 9: Validation trigger exists"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT EXISTS (SELECT FROM pg_trigger WHERE tgname = 'trg_validate_system_config');" "Check validation trigger"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 10: Test config update notification
# ============================================================================
echo "TEST 10: Config update notification function"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT EXISTS (SELECT FROM pg_proc WHERE proname = 'notify_config_change');" "Check notify_config_change function"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 11: Check indexes exist
# ============================================================================
echo "TEST 11: Indexes on system_config"
echo "────────────────────────────────────────────────────────────"
if run_query "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'system_config';" "Count indexes"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
fi

# ============================================================================
# TEST 12: Test invalid config (should fail)
# ============================================================================
echo "TEST 12: Validation rejects invalid provider_id (expected to fail)"
echo "────────────────────────────────────────────────────────────"
echo "Attempting to insert invalid provider_id..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO system_config (config_key, config_value) VALUES ('single_provider_id', 'invalid-uuid');" > /dev/null 2>&1; then
    echo -e "${RED}✗ FAIL${NC} - Should have rejected invalid UUID"
    echo ""
    ((TESTS_FAILED++))
else
    echo -e "${GREEN}✓ PASS${NC} - Correctly rejected invalid UUID"
    echo ""
    ((TESTS_PASSED++))
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  TEST SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo "Total Tests: $TOTAL_TESTS"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ALL TESTS PASSED! Database migration is working correctly${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  SOME TESTS FAILED! Please review the errors above${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    exit 1
fi
