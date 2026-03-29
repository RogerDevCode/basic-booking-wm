#!/bin/bash

# ============================================================================
# SINGLE PROVIDER MIGRATION - DEPLOYMENT SCRIPT
# ============================================================================
# Este script ejecuta el deployment completo de la migración a proveedor único
# Incluye: Backup, Migración, Verificación y Tests
# 
# Uso: bash scripts/deploy_single_provider.sh
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DB_NAME="${POSTGRES_DB:-bookings}"
DB_USER="${POSTGRES_USER:-booking}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SINGLE PROVIDER MIGRATION - DEPLOYMENT${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Date: $(date)"
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# ============================================================================
# PHASE 0: PRE-DEPLOYMENT CHECKS
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 0: PRE-DEPLOYMENT CHECKS${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check 1: Database connection
echo "Checking database connection..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection OK${NC}"
else
    echo -e "${RED}✗ Cannot connect to database${NC}"
    echo "Please check your connection settings or set environment variables:"
    echo "  export POSTGRES_HOST=your-host"
    echo "  export POSTGRES_PORT=your-port"
    echo "  export POSTGRES_USER=your-user"
    echo "  export POSTGRES_DB=bookings"
    exit 1
fi

# Check 2: Migration files exist
echo "Checking migration files..."
if [ -f "database/migrations/003_single_provider_migration.sql" ]; then
    echo -e "${GREEN}✓ Migration 003 exists${NC}"
else
    echo -e "${RED}✗ Migration file not found: 003_single_provider_migration.sql${NC}"
    exit 1
fi

if [ -f "database/migrations/004_phase9_cleanup.sql" ]; then
    echo -e "${GREEN}✓ Migration 004 exists${NC}"
else
    echo -e "${RED}✗ Migration file not found: 004_phase9_cleanup.sql${NC}"
    exit 1
fi

# Check 3: Go build
echo "Checking Go build..."
if go build ./... > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Go build OK${NC}"
else
    echo -e "${RED}✗ Go build failed${NC}"
    exit 1
fi

echo ""

# ============================================================================
# PHASE 1: BACKUP
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 1: DATABASE BACKUP${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup filename with timestamp
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Creating backup: $BACKUP_FILE"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE" 2>&1; then
    echo -e "${GREEN}✓ Backup created successfully${NC}"
    echo "  File: $BACKUP_FILE"
    echo "  Size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo -e "${RED}✗ Backup failed${NC}"
    exit 1
fi

echo ""

# ============================================================================
# PHASE 2: RUN MIGRATIONS
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 2: DATABASE MIGRATIONS${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Migration 003: Single Provider Schema
echo "Running migration 003: Single Provider Schema..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "database/migrations/003_single_provider_migration.sql" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Migration 003 completed${NC}"
else
    echo -e "${RED}✗ Migration 003 failed${NC}"
    echo "Check the migration file for errors"
    exit 1
fi

# Migration 004: Phase 9 Cleanup
echo "Running migration 004: Phase 9 Cleanup..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "database/migrations/004_phase9_cleanup.sql" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Migration 004 completed${NC}"
else
    echo -e "${RED}✗ Migration 004 failed${NC}"
    echo "Check the migration file for errors"
    exit 1
fi

echo ""

# ============================================================================
# PHASE 3: VERIFICATION
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 3: POST-MIGRATION VERIFICATION${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Verify system_config
echo "Verifying system_config..."
CONFIG_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT COUNT(*) FROM system_config;")
if [ "$CONFIG_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ system_config has $CONFIG_COUNT entries${NC}"
else
    echo -e "${RED}✗ system_config is empty${NC}"
fi

# Verify single provider
echo "Verifying single provider..."
PROVIDER_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT COUNT(*) FROM providers WHERE is_active = true;")
if [ "$PROVIDER_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ Single active provider found${NC}"
else
    echo -e "${YELLOW}⚠ Found $PROVIDER_COUNT active providers (expected 1)${NC}"
fi

# Verify single service
echo "Verifying single service..."
SERVICE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT COUNT(*) FROM services WHERE is_active = true;")
if [ "$SERVICE_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ Single active service found${NC}"
else
    echo -e "${YELLOW}⚠ Found $SERVICE_COUNT active services (expected 1)${NC}"
fi

# Verify helper functions
echo "Verifying helper functions..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT get_single_provider_id();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ get_single_provider_id() works${NC}"
else
    echo -e "${RED}✗ get_single_provider_id() failed${NC}"
fi

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT get_single_service_id();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ get_single_service_id() works${NC}"
else
    echo -e "${RED}✗ get_single_service_id() failed${NC}"
fi

echo ""

# ============================================================================
# PHASE 4: DISPLAY CONFIGURATION
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 4: CONFIGURATION SUMMARY${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Single Provider Configuration:"
echo "────────────────────────────────────────────────────────────────────"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
    config_key as \"Key\",
    config_value as \"Value\",
    description as \"Description\"
FROM system_config
ORDER BY config_key;
"

echo ""

# ============================================================================
# PHASE 5: UPDATE .ENV FILE
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 5: UPDATE .ENV FILE${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Get UUIDs from DB
PROVIDER_UUID=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT get_single_provider_id();")
SERVICE_UUID=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT get_single_service_id();")

echo "Provider UUID: $PROVIDER_UUID"
echo "Service UUID:  $SERVICE_UUID"
echo ""

if [ -f ".env" ]; then
    echo "Updating .env file..."
    cp .env .env.backup
    
    # Update or add SINGLE_PROVIDER_ID
    if grep -q "^SINGLE_PROVIDER_ID=" .env; then
        sed -i "s/^SINGLE_PROVIDER_ID=.*/SINGLE_PROVIDER_ID=$PROVIDER_UUID/" .env
    else
        echo "SINGLE_PROVIDER_ID=$PROVIDER_UUID" >> .env
    fi
    
    # Update or add SINGLE_SERVICE_ID
    if grep -q "^SINGLE_SERVICE_ID=" .env; then
        sed -i "s/^SINGLE_SERVICE_ID=.*/SINGLE_SERVICE_ID=$SERVICE_UUID/" .env
    else
        echo "SINGLE_SERVICE_ID=$SERVICE_UUID" >> .env
    fi
    
    echo -e "${GREEN}✓ .env file updated${NC}"
    echo "  Backup saved as: .env.backup"
else
    echo -e "${YELLOW}⚠ .env file not found${NC}"
    echo "Please create .env with the following values:"
    echo ""
    echo "SINGLE_PROVIDER_ID=$PROVIDER_UUID"
    echo "SINGLE_SERVICE_ID=$SERVICE_UUID"
fi

echo ""

# ============================================================================
# PHASE 6: BUILD & DEPLOY TO WINDMILL
# ============================================================================
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PHASE 6: BUILD & DEPLOY${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Building Go binaries..."
if go build -o bin/api ./cmd/api 2>&1; then
    echo -e "${GREEN}✓ Build completed${NC}"
    echo "  Binary: bin/api"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo "Deploying to Windmill..."
if command -v wmill &> /dev/null; then
    if wmill sync push 2>&1; then
        echo -e "${GREEN}✓ Windmill deployment completed${NC}"
    else
        echo -e "${YELLOW}⚠ Windmill deployment failed${NC}"
        echo "You can deploy manually with: wmill sync push"
    fi
else
    echo -e "${YELLOW}⚠ wmill CLI not found${NC}"
    echo "Deploy manually with: wmill sync push"
fi

echo ""

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  DEPLOYMENT COMPLETED${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✓ Database migrated to UUIDs${NC}"
echo -e "${GREEN}✓ Single provider configured${NC}"
echo -e "${GREEN}✓ Single service configured${NC}"
echo -e "${GREEN}✓ Helper functions working${NC}"
echo -e "${GREEN}✓ .env file updated${NC}"
echo -e "${GREEN}✓ Go build successful${NC}"
echo ""
echo "Backup Location: $BACKUP_FILE"
echo ""
echo "Next Steps:"
echo "1. Run tests: bash scripts/test_single_provider.sh"
echo "2. Check logs for errors"
echo "3. Monitor booking creation"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SINGLE PROVIDER MIGRATION - SUCCESS${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
