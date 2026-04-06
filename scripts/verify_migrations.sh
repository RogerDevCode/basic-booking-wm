#!/bin/bash
# ============================================================================
# Migration Verification Script
# Compares local migration files against production database state
# ============================================================================

set -e

# Production database connection
DB_URL="${DATABASE_URL:-postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=============================================="
echo "🔍 Migration Verification Report"
echo "=============================================="
echo "Database: Neon (production)"
echo "Date: $(date -Iseconds)"
echo ""

# Function to check if a table exists
check_table() {
    local table=$1
    local result=$(psql "$DB_URL" -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = '$table' AND table_schema = 'public');" 2>/dev/null | tr -d ' ')
    if [ "$result" = "t" ]; then
        echo -e "  ✅ Table '$table' EXISTS"
        return 0
    else
        echo -e "  ❌ Table '$table' MISSING"
        return 1
    fi
}

# Function to check if a column exists
check_column() {
    local table=$1
    local column=$2
    local result=$(psql "$DB_URL" -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = '$table' AND column_name = '$column' AND table_schema = 'public');" 2>/dev/null | tr -d ' ')
    if [ "$result" = "t" ]; then
        echo -e "  ✅ Column '$table.$column' EXISTS"
        return 0
    else
        echo -e "  ❌ Column '$table.$column' MISSING"
        return 1
    fi
}

# Function to check if an index exists
check_index() {
    local index=$1
    local result=$(psql "$DB_URL" -t -c "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = '$index');" 2>/dev/null | tr -d ' ')
    if [ "$result" = "t" ]; then
        echo -e "  ✅ Index '$index' EXISTS"
        return 0
    else
        echo -e "  ❌ Index '$index' MISSING"
        return 1
    fi
}

# Function to check if a policy exists
check_policy() {
    local policy=$1
    local table=$2
    local result=$(psql "$DB_URL" -t -c "SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname = '$policy' AND tablename = '$table');" 2>/dev/null | tr -d ' ')
    if [ "$result" = "t" ]; then
        echo -e "  ✅ Policy '$policy' on '$table' EXISTS"
        return 0
    else
        echo -e "  ❌ Policy '$policy' on '$table' MISSING"
        return 1
    fi
}

# Function to check if an extension exists
check_extension() {
    local ext=$1
    local result=$(psql "$DB_URL" -t -c "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = '$ext');" 2>/dev/null | tr -d ' ')
    if [ "$result" = "t" ]; then
        echo -e "  ✅ Extension '$ext' EXISTS"
        return 0
    else
        echo -e "  ❌ Extension '$ext' MISSING"
        return 1
    fi
}

# ============================================================================
# CHECK EACH MIGRATION
# ============================================================================

total_checks=0
passed_checks=0
failed_checks=0

run_check() {
    local check_type=$1
    local arg1=$2
    local arg2=$3
    local arg3=$4
    local arg4=$5
    local result
    total_checks=$((total_checks + 1))
    if $check_type "$arg1" "$arg2" "$arg3" "$arg4" 2>/dev/null; then
        passed_checks=$((passed_checks + 1))
    else
        failed_checks=$((failed_checks + 1))
    fi
}

echo "----------------------------------------------"
echo "📦 Migration 001: Add Exclude Constraint"
echo "----------------------------------------------"
run_check check_extension "btree_gist"
run_check check_table "bookings"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 002: Optimize Indexes"
echo "----------------------------------------------"
run_check check_index "idx_bookings_availability"
run_check check_index "idx_booking_intents_status"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 003: Complete Schema Overhaul"
echo "----------------------------------------------"
run_check check_table "providers"
run_check check_table "services"
run_check check_table "bookings"
run_check check_table "provider_schedules"
run_check check_table "patients"
run_check check_column "providers" "specialty"
run_check check_column "providers" "phone"
run_check check_column "providers" "telegram_chat_id"
run_check check_column "providers" "timezone"
run_check check_column "providers" "created_at"
run_check check_column "providers" "updated_at"
run_check check_column "providers" "provider_id"
run_check check_table "knowledge_base"
run_check check_table "conversations"
run_check check_table "booking_intents"
run_check check_table "booking_locks"
run_check check_table "booking_dlq"
run_check check_table "circuit_breaker_state"
run_check check_table "audit_logs"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 004a: Create Users Table"
echo "----------------------------------------------"
run_check check_table "users"
run_check check_column "users" "email"
run_check check_column "users" "role"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 004b: Scheduling Engine"
echo "----------------------------------------------"
run_check check_table "provider_services"
run_check check_table "provider_exceptions"
run_check check_table "timezones"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 005: Clinical Notes"
echo "----------------------------------------------"
# Clinical notes table may not exist if not applied
run_check check_table "clinical_notes" 2>/dev/null || echo -e "  ℹ️  Table 'clinical_notes' not checked (may not be applied)"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 006: Waitlist"
echo "----------------------------------------------"
run_check check_table "waitlist"
run_check check_index "idx_waitlist_lookup"
echo ""

echo "----------------------------------------------"
echo "📦 Migration 007: Multi-Provider RAG Isolation"
echo "----------------------------------------------"
run_check check_policy "kb_tenant_isolation" "knowledge_base"
run_check check_policy "provider_tenant_isolation" "providers"
run_check check_index "idx_kb_provider"
run_check check_index "idx_patients_provider"
run_check check_index "idx_conversations_provider"
echo ""

echo "----------------------------------------------"
echo "📦 RAG FAQ Seeding"
echo "----------------------------------------------"
faq_count=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM knowledge_base WHERE category IS NOT NULL;" 2>/dev/null | tr -d ' ')
if [ "$faq_count" != "" ] && [ "$faq_count" -gt 0 ] 2>/dev/null; then
    echo -e "  ✅ knowledge_base has $faq_count entries"
    passed_checks=$((passed_checks + 1))
else
    echo -e "  ⚠️  knowledge_base is empty or not accessible"
    failed_checks=$((failed_checks + 1))
fi
total_checks=$((total_checks + 1))
echo ""

echo "=============================================="
echo "📊 SUMMARY"
echo "=============================================="
echo -e "Total checks:  $total_checks"
echo -e "Passed:        ${GREEN}$passed_checks${NC}"
echo -e "Failed:        ${RED}$failed_checks${NC}"
echo ""

if [ $failed_checks -eq 0 ]; then
    echo -e "${GREEN}✅ All migrations are applied correctly!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  $failed_checks checks failed — some migrations may be incomplete${NC}"
    echo ""
    echo "To apply missing migrations, run:"
    echo "  psql \"\$DATABASE_URL\" -f migrations/00X_migration_name.sql"
    exit 1
fi
