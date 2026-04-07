-- ============================================================================
-- Migration: 004_add_gist_exclude_constraint.sql
-- Purpose: Add GiST EXCLUDE constraint to prevent overlapping bookings
-- Severity: CRITICAL — prevents double-booking at DB level
-- Date: 2026-04-07
--
-- Context: Migration 003 recreated the bookings table but omitted the
-- EXCLUDE USING gist constraint defined in AGENTS.md §6. This migration
-- adds it back. If the constraint already exists (from migration 001),
-- this migration is a safe no-op.
-- ============================================================================

-- Ensure btree_gist extension is available
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Add the GiST exclusion constraint if it doesn't already exist
-- This prevents two active bookings for the same provider from overlapping
DO $$
BEGIN
  -- Check if constraint already exists (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_no_overlap_gist'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT booking_no_overlap_gist
      EXCLUDE USING gist (
        provider_id WITH =,
        tstzrange(start_time, end_time) WITH &&
      )
      WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

    RAISE NOTICE '✅ GiST EXCLUDE constraint added: booking_no_overlap_gist';
  ELSE
    RAISE NOTICE 'ℹ️  GiST EXCLUDE constraint already exists: booking_no_overlap_gist — skipping';
  END IF;
END $$;

-- Verify the constraint is active
DO $$
DECLARE
  constraint_count INT;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint
  WHERE conname = 'booking_no_overlap_gist';

  IF constraint_count = 0 THEN
    RAISE EXCEPTION '❌ GiST EXCLUDE constraint was not created successfully';
  ELSE
    RAISE NOTICE '✅ GiST EXCLUDE constraint verified: booking_no_overlap_gist is active';
  END IF;
END $$;
