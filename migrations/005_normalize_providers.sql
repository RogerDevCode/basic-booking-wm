-- ============================================================================
-- Migration: 005_normalize_providers.sql
-- Purpose: Consolidate duplicate id/provider_id columns in providers table
-- Severity: CRITICAL — schema inconsistency causes confusion and bugs
-- Date: 2026-04-07
--
-- Current state (from production):
--   id          UUID NOT NULL PK  (original column)
--   provider_id UUID UNIQUE DEFAULT gen_random_uuid()
--
-- Target state (AGENTS.md §6):
--   provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   (no separate id column)
--
-- Strategy:
--   1. Clean orphan data (references to non-existent providers)
--   2. Drop ALL FK constraints referencing providers
--   3. Drop old PK on id, drop unique on provider_id
--   4. Make provider_id the PK, drop id column
--   5. Recreate ALL FK constraints pointing to provider_id
-- ============================================================================

BEGIN;

-- ── Step 1: Check if normalization is needed ────────────────────────────────
DO $$
DECLARE
  has_id_column BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'id'
  ) INTO has_id_column;

  IF has_id_column = FALSE THEN
    RAISE NOTICE 'ℹ️  providers table already normalized — no id column';
    RETURN;
  END IF;

  -- ── Step 2: Clean orphan data ─────────────────────────────────────────────
  -- Delete orphan booking_locks (ephemeral, safe to delete)
  DELETE FROM booking_locks WHERE provider_id NOT IN (SELECT provider_id FROM providers);
  
  -- Delete orphan booking_dlq (DLQ for non-existent providers is useless)
  DELETE FROM booking_dlq WHERE provider_id NOT IN (SELECT provider_id FROM providers);
  
  -- Delete orphan booking_intents (intents for non-existent providers are useless)
  DELETE FROM booking_intents WHERE provider_id NOT IN (SELECT provider_id FROM providers);
  
  -- Delete orphan provider_schedules
  DELETE FROM provider_schedules WHERE provider_id NOT IN (SELECT provider_id FROM providers);
  
  -- Delete orphan bookings (provider doesn't exist)
  DELETE FROM bookings WHERE provider_id NOT IN (SELECT provider_id FROM providers);
  
  -- Delete services with NULL or invalid provider_id
  DELETE FROM services WHERE provider_id IS NULL OR provider_id NOT IN (SELECT provider_id FROM providers);

  RAISE NOTICE '✅ Orphan data cleaned';

  -- ── Step 3: Drop ALL FK constraints referencing providers ─────────────────
  ALTER TABLE booking_dlq DROP CONSTRAINT IF EXISTS booking_dlq_provider_id_fkey;
  ALTER TABLE booking_intents DROP CONSTRAINT IF EXISTS booking_intents_provider_id_fkey;
  ALTER TABLE booking_locks DROP CONSTRAINT IF EXISTS booking_locks_provider_id_fkey;
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_booking_provider;
  ALTER TABLE provider_schedules DROP CONSTRAINT IF EXISTS fk_provider;
  ALTER TABLE schedule_overrides DROP CONSTRAINT IF EXISTS schedule_overrides_provider_id_fkey;
  ALTER TABLE service_notes DROP CONSTRAINT IF EXISTS service_notes_provider_id_fkey;
  ALTER TABLE services DROP CONSTRAINT IF EXISTS services_provider_id_fkey;

  -- ── Step 4: Drop old PK on id ────────────────────────────────────────────
  ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_pkey;

  -- ── Step 5: Drop unique constraint on provider_id ────────────────────────
  ALTER TABLE providers DROP CONSTRAINT IF EXISTS uq_providers_provider_id;

  -- ── Step 6: Make provider_id the primary key ─────────────────────────────
  ALTER TABLE providers ADD PRIMARY KEY (provider_id);

  -- ── Step 7: Drop the old id column ───────────────────────────────────────
  ALTER TABLE providers DROP COLUMN IF EXISTS id;

  -- ── Step 8: Recreate ALL FK constraints pointing to provider_id ──────────
  ALTER TABLE bookings
    ADD CONSTRAINT fk_booking_provider
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE booking_dlq
    ADD CONSTRAINT booking_dlq_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE booking_intents
    ADD CONSTRAINT booking_intents_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE booking_locks
    ADD CONSTRAINT booking_locks_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE provider_schedules
    ADD CONSTRAINT fk_provider
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE schedule_overrides
    ADD CONSTRAINT schedule_overrides_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE service_notes
    ADD CONSTRAINT service_notes_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  ALTER TABLE services
    ADD CONSTRAINT services_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  RAISE NOTICE '✅ providers table normalized: provider_id is now the PK, id column removed, orphan data cleaned';
END $$;

COMMIT;
