-- ============================================================================
-- Migration: 006_normalize_services.sql
-- Purpose: Normalize services table to match AGENTS.md §6 schema
-- Severity: HIGH — current schema is missing required columns
-- Date: 2026-04-07
--
-- Current state (from production):
--   id           UUID PK
--   name         TEXT NOT NULL
--   duration_min INT NOT NULL DEFAULT 30
--   buffer_min   INT NOT NULL DEFAULT 10
--   price        NUMERIC(10,2) DEFAULT 0
--   currency     VARCHAR(10) DEFAULT 'USD'
--   is_active    BOOLEAN DEFAULT true
--   provider_id  UUID
--
-- Target state (AGENTS.md §6):
--   service_id       UUID PRIMARY KEY
--   provider_id      UUID NOT NULL
--   name             TEXT NOT NULL
--   duration_minutes INT NOT NULL DEFAULT 30
--   buffer_minutes   INT NOT NULL DEFAULT 10
--   price_cents      INT DEFAULT 0
-- ============================================================================

BEGIN;

-- ── Step 1: Check if normalization is needed ────────────────────────────────
DO $$
DECLARE
  has_id_col BOOLEAN;
  has_service_id_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'id'
  ) INTO has_id_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'service_id'
  ) INTO has_service_id_col;

  IF has_id_col = FALSE AND has_service_id_col = TRUE THEN
    RAISE NOTICE 'ℹ️  services table already normalized';
    RETURN;
  END IF;

  -- ── Step 2: Add service_id column if missing ─────────────────────────────
  IF NOT has_service_id_col THEN
    ALTER TABLE services ADD COLUMN service_id UUID DEFAULT gen_random_uuid();
    -- Copy existing id values to service_id
    UPDATE services SET service_id = id WHERE service_id IS NULL;
  END IF;

  -- ── Step 3: Rename columns to match §6 schema ────────────────────────────
  -- duration_min → duration_minutes
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'duration_min'
  ) THEN
    ALTER TABLE services RENAME COLUMN duration_min TO duration_minutes;
  END IF;

  -- buffer_min → buffer_minutes
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'buffer_min'
  ) THEN
    ALTER TABLE services RENAME COLUMN buffer_min TO buffer_minutes;
  END IF;

  -- price → price_cents (convert from decimal to integer cents)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'price'
  ) THEN
    -- Convert decimal price to integer cents
    ALTER TABLE services ADD COLUMN price_cents INT DEFAULT 0;
    UPDATE services SET price_cents = COALESCE((price * 100)::INT, 0);
    ALTER TABLE services DROP COLUMN price;
  END IF;

  -- ── Step 4: Make service_id the primary key ──────────────────────────────
  ALTER TABLE services DROP CONSTRAINT IF EXISTS services_pkey;
  ALTER TABLE services ADD PRIMARY KEY (service_id);

  -- Drop old id column
  ALTER TABLE services DROP COLUMN IF EXISTS id;

  -- ── Step 5: Add missing columns per §6 schema ────────────────────────────

  -- description column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'description'
  ) THEN
    ALTER TABLE services ADD COLUMN description TEXT;
  END IF;

  -- provider_id NOT NULL constraint (after ensuring no nulls)
  UPDATE services SET provider_id = '00000000-0000-0000-0000-000000000000' WHERE provider_id IS NULL;
  ALTER TABLE services ALTER COLUMN provider_id SET NOT NULL;

  -- ── Step 6: Recreate FK constraints ──────────────────────────────────────
  ALTER TABLE services DROP CONSTRAINT IF EXISTS services_provider_id_fkey;
  ALTER TABLE services
    ADD CONSTRAINT services_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

  -- ── Step 7: Recreate indexes ─────────────────────────────────────────────
  DROP INDEX IF EXISTS idx_services_provider;
  CREATE INDEX idx_services_provider ON services(provider_id);

  RAISE NOTICE '✅ services table normalized: service_id is PK, columns match §6 schema';
END $$;

COMMIT;
