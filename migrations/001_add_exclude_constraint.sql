-- ============================================================================
-- Migration: 001_add_exclude_constraint.sql
-- Purpose: Add GiST EXCLUDE constraint to prevent overlapping bookings
-- Severity: CRITICAL - Fixes booking collision under concurrency
-- Date: 2026-03-30
-- ============================================================================

-- Step 1: Enable required extension for GiST indexes with scalar types
-- This allows combining provider_id (=) with time ranges (&&)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Step 2: Check for existing overlapping bookings BEFORE adding constraint
-- This query MUST return 0 rows, otherwise constraint will fail
-- Run this first and fix any overlaps manually if found
SELECT 
    b1.booking_id AS booking_1,
    b2.booking_id AS booking_2,
    b1.provider_id,
    b1.start_time AS start_1,
    b1.end_time AS end_1,
    b2.start_time AS start_2,
    b2.end_time AS end_2,
    'OVERLAP DETECTED' AS issue
FROM bookings b1
JOIN bookings b2 ON b1.provider_id = b2.provider_id
  AND b1.start_time < b2.end_time
  AND b2.start_time < b1.end_time
  AND b1.booking_id != b2.booking_id
  AND b1.status NOT IN ('cancelled', 'no_show', 'rescheduled')
  AND b2.status NOT IN ('cancelled', 'no_show', 'rescheduled')
ORDER BY b1.start_time;

-- If the above returns rows, you MUST fix them before proceeding:
-- Option 1: Cancel one of the overlapping bookings
-- UPDATE bookings SET status = 'cancelled', cancellation_reason = 'Overlap fix' WHERE booking_id = '...';
--
-- Option 2: Reschedule one booking
-- UPDATE bookings SET start_time = '...', end_time = '...' WHERE booking_id = '...';

-- Step 3: Create GiST index for exclusion constraint
-- Using CONCURRENTLY to avoid locking table during index creation
-- This may take several minutes on large tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_no_overlap
ON bookings USING gist (
    provider_id,
    tstzrange(start_time, end_time)
) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

-- Step 4: Add exclusion constraint
-- This prevents ANY overlapping bookings at database level
-- Cannot be added if overlapping data exists (checked in Step 2)
ALTER TABLE bookings
ADD CONSTRAINT booking_no_overlap
EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_time, end_time) WITH &&
) WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

-- Step 5: Verify constraint was added successfully
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    condeferrable AS deferrable,
    convalidated AS validated
FROM pg_constraint
WHERE conname = 'booking_no_overlap';

-- Step 6: Verify GiST index exists
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'bookings'
  AND indexdef LIKE '%gist%';

-- ============================================================================
-- Rollback Instructions (EMERGENCY ONLY)
-- ============================================================================
-- If you need to rollback this migration:
--
-- ALTER TABLE bookings DROP CONSTRAINT booking_no_overlap;
-- DROP INDEX IF EXISTS idx_bookings_no_overlap;
-- -- DO NOT drop btree_gist extension (may be used by other tables)
-- ============================================================================

-- Step 7: Log migration success
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 001 completed successfully';
    RAISE NOTICE '✅ GiST EXCLUDE constraint added: booking_no_overlap';
    RAISE NOTICE '✅ Overlapping bookings are now structurally impossible';
END $$;
