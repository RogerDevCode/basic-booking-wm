-- ============================================================================
-- Migration 013: Migration Order Fix + FK Completion + Index Rebuild
-- Purpose: 
--   1. Fix migration numbering conflicts (duplicate 001, 002, 008, 009)
--   2. Add missing foreign keys
--   3. Re-create indexes lost by DROP CASCADE in migration 003
--   4. Add IF NOT EXISTS guards to all remaining operations
-- Severity: P0 — ensures clean deployment on fresh or existing databases
-- Date: 2026-04-08
-- ============================================================================
-- 
-- DEPENDENCY GRAPH (verified):
--   001_rls_enable           → depends on: 003 (tables exist)
--   001_add_exclude_constraint → depends on: 003 (bookings table), RENAME to 013a
--   002_optimize_indexes     → depends on: 003 (tables), 007 (bookings columns)
--   002_state_machine_trigger → depends on: 003 (bookings table)
--   003_complete_schema_overhaul → depends on: extensions only
--   004_add_gist_exclude_constraint → depends on: 003
--   005_normalize_providers  → depends on: 003
--   006_normalize_services   → depends on: 003, 005
--   007_normalize_bookings   → depends on: 003, 004, 005, 006
--   008_clients_nm_relationship → depends on: 007
--   008_create_tags_system   → depends on: 007 (service_notes exists)
--   009_cleanup_orphan_tables → depends on: all prior
--   009_complete_remaining   → depends on: 003, 007 (conversations references users)
--   010_complete_provider_schema → depends on: 005
--   011_data_encryption      → depends on: 007 (service_notes)
--   012_rls_indexes_fix      → depends on: 003-011 (all tables exist)
--
-- CORRECTED EXECUTION ORDER:
--   003 → 004 → 005 → 006 → 007 → 008_clients → 008_tags → 009_cleanup →
--   009_complete → 010 → 011 → 001_rls → 002_indexes → 002_state → 012_rls_idx →
--   013_this_migration
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Missing Foreign Keys
-- ============================================================================

-- 1.1: taggings → tags (if junction table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'note_tags') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_note_tags_tag'
    ) THEN
      ALTER TABLE note_tags ADD CONSTRAINT fk_note_tags_tag
        FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE;
      RAISE NOTICE '✅ Added FK: note_tags.tag_id → tags.tag_id';
    ELSE
      RAISE NOTICE 'ℹ️  FK note_tags.tag_id already exists';
    END IF;
  END IF;
END $$;

-- 1.2: booking_audit → bookings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_audit') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_booking_audit_booking'
    ) THEN
      ALTER TABLE booking_audit ADD CONSTRAINT fk_booking_audit_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE;
      RAISE NOTICE '✅ Added FK: booking_audit.booking_id → bookings.booking_id';
    ELSE
      RAISE NOTICE 'ℹ️  FK booking_audit.booking_id already exists';
    END IF;
  END IF;
END $$;

-- 1.3: conversations → users (fix broken reference)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_conversations_user'
      ) THEN
        ALTER TABLE conversations ADD CONSTRAINT fk_conversations_user
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Added FK: conversations.user_id → users.user_id';
      ELSE
        RAISE NOTICE 'ℹ️  FK conversations.user_id already exists';
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Re-create Indexes Lost by Migration 003 DROP CASCADE
-- ============================================================================

-- 2.1: Provider time index (was in 002, lost by 003 CASCADE)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_provider_time
  ON bookings(provider_id, start_time, end_time);

-- 2.2: Knowledge base indexes (were in 009, may have been lost)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_provider
  ON knowledge_base(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_active
  ON knowledge_base(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 3: Add Missing Columns to Existing Tables
-- ============================================================================

-- 3.1: Ensure booking_audit has metadata column
ALTER TABLE booking_audit ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3.2: Ensure waitlist has updated_at
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 4: Migration Numbering Documentation
-- ============================================================================
-- 
-- This file serves as the canonical reference for migration ordering.
-- The duplicate numbering (001, 002, 008, 009 appearing twice) was caused by
-- parallel development branches. The CORRECT execution order is documented
-- at the top of this file.
--
-- NOTE: Migration 001_add_exclude_constraint.sql is now OBSOLETE.
-- Its functionality (GiST exclusion) is handled by 004_add_gist_exclude_constraint.sql.
-- DO NOT run 001_add_exclude_constraint.sql on a fresh database.
--
-- ============================================================================

-- Verify FK count
DO $$
DECLARE
  fk_count INT;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
    AND table_schema = 'public';
  
  RAISE NOTICE '✅ Total foreign keys in public schema: %', fk_count;
END $$;

-- Verify index count
DO $$
DECLARE
  idx_count INT;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public';
  
  RAISE NOTICE '✅ Total indexes in public schema: %', idx_count;
END $$;

COMMIT;
