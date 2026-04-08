-- ============================================================================
-- Migration: 007_normalize_bookings.sql
-- Purpose: Normalize bookings table to match AGENTS.md §6 schema exactly
-- Severity: CRITICAL — current schema has legacy columns and missing fields
-- Date: 2026-04-07
-- ============================================================================

BEGIN;

-- ── Step 1: Drop legacy columns ────────────────────────────────────────────
ALTER TABLE bookings DROP COLUMN IF EXISTS user_id;
ALTER TABLE bookings DROP COLUMN IF EXISTS gcal_event_id;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_1_hours;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_2_hours;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_3_hours;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_1_sent;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_2_sent;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_3_sent;
ALTER TABLE bookings DROP COLUMN IF EXISTS short_code;
ALTER TABLE bookings DROP COLUMN IF EXISTS status_reason;
ALTER TABLE bookings DROP COLUMN IF EXISTS gcal_synced_at;
ALTER TABLE bookings DROP COLUMN IF EXISTS cancelled_at;

-- ── Step 2: Normalize status values to lowercase ───────────────────────────
UPDATE bookings SET status = LOWER(status) WHERE status != LOWER(status);

-- ── Step 3: Ensure NOT NULL constraints ────────────────────────────────────
ALTER TABLE bookings ALTER COLUMN provider_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN idempotency_key SET NOT NULL;

-- ── Step 4: Add missing columns per §6 schema (using ADD COLUMN IF NOT EXISTS) ─
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rescheduled_to UUID REFERENCES bookings(booking_id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcal_provider_event_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcal_client_event_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcal_last_sync TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_30min_sent BOOLEAN DEFAULT false;

-- ── Step 5: Status check constraint ────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled'));

-- ── Step 6: Ensure client_id NOT NULL ──────────────────────────────────────
UPDATE bookings SET client_id = '00000000-0000-0000-0000-000000000000' WHERE client_id IS NULL;
ALTER TABLE bookings ALTER COLUMN client_id SET NOT NULL;

-- ── Step 7: Recreate FK constraints ────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_booking_provider;
ALTER TABLE bookings
  ADD CONSTRAINT fk_booking_provider
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_booking_service;
ALTER TABLE bookings
  ADD CONSTRAINT fk_booking_service
  FOREIGN KEY (service_id) REFERENCES services(service_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_client_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(client_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_rescheduled_from_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_rescheduled_from_fkey
  FOREIGN KEY (rescheduled_from) REFERENCES bookings(booking_id);

-- ── Step 8: Ensure idempotency_key is unique ───────────────────────────────
DROP INDEX IF EXISTS idx_bookings_idempotency;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_idempotency_key_key;
ALTER TABLE bookings ADD CONSTRAINT bookings_idempotency_key_key UNIQUE (idempotency_key);

COMMIT;
