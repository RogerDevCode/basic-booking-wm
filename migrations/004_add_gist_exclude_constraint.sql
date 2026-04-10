-- ============================================================================
-- Migration: 004_add_gist_exclude_constraint.sql
-- Purpose: SAFE NO-OP — GiST constraint was moved to 003 (CREATE TABLE inline)
-- Severity: N/A — idempotent verification only
-- Date: 2026-04-07 (updated 2026-04-08)
--
-- Context: The GiST EXCLUDE constraint is now defined inline in the CREATE TABLE
-- of migration 003. This migration now only verifies the constraint exists.
-- It is safe to run on any database state — will always be a no-op.
-- ============================================================================

-- Verify the GiST constraint is active (no-op if already present from 003)
DO $$
DECLARE
  constraint_count INT;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint
  WHERE conname = 'booking_no_overlap_gist';

  IF constraint_count = 0 THEN
    RAISE WARNING '⚠️  GiST EXCLUDE constraint booking_no_overlap_gist is MISSING — should have been created by migration 003';
  ELSE
    RAISE NOTICE '✅ GiST EXCLUDE constraint verified: booking_no_overlap_gist is active (from migration 003)';
  END IF;
END $$;
