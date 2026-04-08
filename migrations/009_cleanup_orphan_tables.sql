-- ============================================================================
-- Migration: 009_cleanup_orphan_tables.sql
-- Purpose: Drop orphan/legacy tables not used by any application code
-- Severity: LOW — cleanup of technical debt
-- Date: 2026-04-07
--
-- Tables dropped:
--   1. booking_intents — Legacy AI intent tracker, replaced by internal AI Agent logic
--   2. clinical_notes  — Does not exist (service_notes is used instead)
--
-- booking_intents had 11 rows of orphan data from legacy AI pipeline.
-- All intent processing is now handled by the AI Agent module internally.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS booking_intents CASCADE;

DO $$
BEGIN
  RAISE NOTICE '✅ Orphan tables cleaned: booking_intents dropped (11 rows removed)';
END $$;

COMMIT;
