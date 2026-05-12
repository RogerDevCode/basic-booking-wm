-- Migration: Add EXCLUDE USING GIST constraint to prevent double-booking race condition
-- Fixes: TOCTOU vulnerability where two concurrent requests could book the same slot
-- Requires: btree_gist extension (available in PostgreSQL 13+)
--
-- IMPORTANT: Run this in a maintenance window. The ALTER TABLE acquires a ShareUpdateExclusiveLock.
-- On a table with many rows, consider running during low-traffic hours.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
    ADD CONSTRAINT no_overlapping_active_bookings
    EXCLUDE USING GIST (
        provider_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    )
    WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

COMMIT;
