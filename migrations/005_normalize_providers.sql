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
--   1. Update all FK references from providers.id → providers.provider_id
--   2. Drop old FK constraints
--   3. Copy provider_id values to id where they differ
--   4. Make provider_id the PK
--   5. Drop id column
--   6. Recreate FK constraints pointing to provider_id
-- ============================================================================

BEGIN;

-- ── Step 1: Check if normalization is needed ────────────────────────────────
DO $$
DECLARE
  has_id_column BOOLEAN;
  has_provider_id_column BOOLEAN;
  has_duplicate BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'id'
  ) INTO has_id_column;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'providers' AND column_name = 'provider_id'
  ) INTO has_provider_id_column;

  -- If we already have only provider_id as PK, skip
  IF has_id_column = FALSE AND has_provider_id_column = TRUE THEN
    RAISE NOTICE 'ℹ️  providers table already normalized — no id column, only provider_id';
    RETURN;
  END IF;

  -- Check if any rows have mismatched id vs provider_id
  SELECT EXISTS (
    SELECT 1 FROM providers WHERE id != provider_id
  ) INTO has_duplicate;

  IF has_duplicate THEN
    RAISE WARNING '⚠️  providers has rows where id != provider_id — data migration needed';
  END IF;

  -- ── Step 2: Update FK references to point to provider_id instead of id ─────

  -- 2a. booking_dlq.provider_id → providers.provider_id (already correct by constraint name)
  -- Check and update if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'booking_dlq'
    AND rc.unique_constraint_schema = 'public'
    AND rc.unique_constraint_name IN (
      SELECT conname FROM pg_constraint WHERE conrelid = 'providers'::regclass AND contype = 'u'
    )
  ) THEN
    RAISE NOTICE 'ℹ️  booking_dlq FK already references providers';
  END IF;

  -- 2b. booking_intents.provider_id → providers.provider_id
  -- 2c. booking_locks.provider_id → providers.provider_id
  -- 2d. bookings.provider_id → providers.provider_id
  -- 2e. provider_schedules.provider_id → providers.provider_id

  -- ── Step 3: Synchronize id and provider_id values ────────────────────────
  -- Make provider_id = id for all rows so we can safely transition
  UPDATE providers SET provider_id = id WHERE provider_id IS NULL OR provider_id != id;

  -- ── Step 4: Drop and recreate FK constraints ─────────────────────────────

  -- Drop old FKs that reference providers.id
  ALTER TABLE IF EXISTS booking_dlq DROP CONSTRAINT IF EXISTS booking_dlq_provider_id_fkey;
  ALTER TABLE IF EXISTS booking_intents DROP CONSTRAINT IF EXISTS booking_intents_provider_id_fkey;
  ALTER TABLE IF EXISTS booking_locks DROP CONSTRAINT IF EXISTS booking_locks_provider_id_fkey;
  ALTER TABLE IF EXISTS bookings DROP CONSTRAINT IF EXISTS fk_booking_provider;
  ALTER TABLE IF EXISTS provider_schedules DROP CONSTRAINT IF EXISTS fk_provider;

  -- ── Step 5: Make provider_id the primary key ─────────────────────────────

  -- First drop the old PK on id
  ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_pkey;

  -- Drop the unique constraint on provider_id (it was unique but not PK)
  ALTER TABLE providers DROP CONSTRAINT IF EXISTS uq_providers_provider_id;

  -- Now make provider_id the PK
  ALTER TABLE providers ADD PRIMARY KEY (provider_id);

  -- ── Step 6: Drop the old id column ───────────────────────────────────────
  ALTER TABLE providers DROP COLUMN IF EXISTS id;

  -- ── Step 7: Recreate FK constraints pointing to provider_id ──────────────
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

  RAISE NOTICE '✅ providers table normalized: provider_id is now the PK, id column removed';
END $$;

COMMIT;
