#!/bin/bash

# ============================================================================
# FIX TEST DATA FOR AVAILABILITY TESTS
# ============================================================================
# Este script inserta datos de test para que los tests de disponibilidad pasen
# 
# Uso: bash scripts/fix_test_data.sh
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

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  FIX TEST DATA FOR AVAILABILITY TESTS${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Get single provider and service IDs
PROVIDER_ID=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT get_single_provider_id();")
SERVICE_ID=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT get_single_service_id();")

echo "Provider ID: $PROVIDER_ID"
echo "Service ID:  $SERVICE_ID"
echo ""

# ============================================================================
# 1. UPDATE SCHEDULES TO COVER FULL DAY (08:00 - 20:00)
# ============================================================================
echo -e "${YELLOW}Updating provider schedules...${NC}"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
UPDATE provider_schedules
SET 
    start_time = '08:00',
    end_time = '20:00',
    service_duration_min = 60,
    buffer_time_min = 10
WHERE provider_id = '$PROVIDER_ID';
"

echo -e "${GREEN}✓ Schedules updated (08:00-20:00, 60min duration, 10min buffer)${NC}"
echo ""

# ============================================================================
# 2. INSERT TEST SLOTS FOR NEXT 7 DAYS
# ============================================================================
echo -e "${YELLOW}Inserting test bookings for next 7 days...${NC}"

# Insert some bookings (but leave plenty of free slots)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
-- Insert a few test bookings (not too many to avoid blocking tests)
INSERT INTO bookings (
    provider_id,
    service_id,
    start_time,
    end_time,
    status,
    idempotency_key,
    created_at
)
SELECT 
    '$PROVIDER_ID'::uuid,
    '$SERVICE_ID'::uuid,
    (CURRENT_DATE + n)::date + TIME '10:00',
    (CURRENT_DATE + n)::date + TIME '11:00',
    'confirmed',
    'test_booking_' || n,
    NOW()
FROM generate_series(1, 3) AS n
ON CONFLICT (idempotency_key) DO NOTHING;
"

echo -e "${GREEN}✓ Test bookings inserted (3 bookings at 10:00 AM)${NC}"
echo ""

# ============================================================================
# 3. VERIFY DATA
# ============================================================================
echo -e "${YELLOW}Verifying test data...${NC}"
echo ""

echo "Provider Schedules:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
    day_of_week,
    start_time,
    end_time,
    service_duration_min,
    buffer_time_min
FROM provider_schedules
WHERE provider_id = '$PROVIDER_ID'
ORDER BY day_of_week;
"

echo ""
echo "Upcoming Bookings (next 7 days):"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 
    booking_id,
    start_time,
    end_time,
    status
FROM bookings
WHERE provider_id = '$PROVIDER_ID'
  AND start_time >= NOW()
  AND start_time <= NOW() + INTERVAL '7 days'
  AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
ORDER BY start_time
LIMIT 10;
"

echo ""

# ============================================================================
# 4. TEST AVAILABILITY QUERY
# ============================================================================
echo -e "${YELLOW}Testing availability query...${NC}"
echo ""

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
-- Test: Check available slots for tomorrow
WITH tomorrow AS (
    SELECT (CURRENT_DATE + INTERVAL '1 day')::date AS test_date
),
slots AS (
    SELECT 
        generate_series(
            test_date + TIME '08:00',
            test_date + TIME '19:00',
            INTERVAL '70 minutes'
        ) AS slot_start
    FROM tomorrow
)
SELECT 
    slot_start,
    slot_start + INTERVAL '60 minutes' AS slot_end,
    CASE 
        WHEN b.booking_id IS NULL THEN 'AVAILABLE'
        ELSE 'BOOKED'
    END AS status
FROM slots s
LEFT JOIN bookings b ON 
    b.provider_id = '$PROVIDER_ID'::uuid
    AND b.service_id = '$SERVICE_ID'::uuid
    AND b.start_time <= s.slot_start + INTERVAL '60 minutes'
    AND b.end_time >= s.slot_start
    AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
ORDER BY slot_start
LIMIT 10;
"

echo ""
echo -e "${GREEN}✓ Test data ready${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  • Schedules: 08:00-20:00 (all days)"
echo "  • Service Duration: 60 minutes"
echo "  • Buffer: 10 minutes"
echo "  • Test Bookings: 3 (at 10:00 AM)"
echo "  • Available Slots: Multiple slots per day"
echo ""
echo "Now you can run availability tests successfully!"
echo ""
