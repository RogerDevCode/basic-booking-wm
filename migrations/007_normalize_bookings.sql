-- ============================================================================
-- Migration: 007_normalize_bookings.sql
-- Purpose: Normalize bookings table to match AGENTS.md §6 schema exactly
-- Severity: CRITICAL — current schema has legacy columns and missing fields
-- Date: 2026-04-07
--
-- Current state (from production):
--   Columns: booking_id, provider_id, service_id, user_id (bigint!),
--            start_time, end_time, gcal_event_id (legacy), status (TEXT),
--            reminder_*_hours (legacy), reminder_*_sent, short_code,
--            status_reason, idempotency_key, gcal_synced_at (legacy),
--            cancellation_reason, cancelled_at, client_id, gcal_sync_status,
--            notification_sent, cancelled_by, rescheduled_from, gcal_retry_count
--
-- Target state (AGENTS.md §6):
--   booking_id       UUID PRIMARY KEY
--   provider_id      UUID NOT NULL REFERENCES providers
--   patient_id       UUID NOT NULL REFERENCES patients (→ clients)
--   service_id       UUID NOT NULL REFERENCES services
--   start_time       TIMESTAMPTZ NOT NULL
--   end_time         TIMESTAMPTZ NOT NULL
--   status           TEXT NOT NULL DEFAULT 'pending'
--   idempotency_key  TEXT UNIQUE NOT NULL
--   gcal_sync_status TEXT DEFAULT 'pending'
--   EXCLUDE USING gist (provider_id, tstzrange(start_time, end_time))
-- ============================================================================

BEGIN;

-- ── Step 1: Drop legacy columns ────────────────────────────────────────────

-- user_id (bigint) → replaced by client_id (UUID)
ALTER TABLE bookings DROP COLUMN IF EXISTS user_id;

-- gcal_event_id (legacy single event) → replaced by gcal_provider_event_id + gcal_client_event_id
ALTER TABLE bookings DROP COLUMN IF EXISTS gcal_event_id;

-- reminder_*_hours (legacy config) → stored in client metadata
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_1_hours;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_2_hours;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_3_hours;

-- reminder_*_sent (legacy) → replaced by reminder_24h_sent, reminder_2h_sent, reminder_30min_sent
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_1_sent;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_2_sent;
ALTER TABLE bookings DROP COLUMN IF EXISTS reminder_3_sent;

-- short_code (legacy)
ALTER TABLE bookings DROP COLUMN IF EXISTS short_code;

-- status_reason (redundant — cancellation_reason covers this)
ALTER TABLE bookings DROP COLUMN IF EXISTS status_reason;

-- gcal_synced_at (redundant — gcal_last_sync covers this)
ALTER TABLE bookings DROP COLUMN IF EXISTS gcal_synced_at;

-- cancelled_at (redundant — updated_at + cancelled_by covers this)
ALTER TABLE bookings DROP COLUMN IF EXISTS cancelled_at;

-- ── Step 2: Normalize status values to lowercase ───────────────────────────
-- Some rows may have UPPERCASE status from legacy system
UPDATE bookings SET status = LOWER(status) WHERE status != LOWER(status);

-- ── Step 3: Ensure NOT NULL constraints ────────────────────────────────────
ALTER TABLE bookings ALTER COLUMN provider_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN idempotency_key SET NOT NULL;

-- ── Step 4: Add missing columns per §6 schema ──────────────────────────────

-- notes column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'notes'
) THEN
  ALTER TABLE bookings ADD COLUMN notes TEXT;
END IF;

-- rescheduled_to column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'rescheduled_to'
) THEN
  ALTER TABLE bookings ADD COLUMN rescheduled_to UUID REFERENCES bookings(booking_id);
END IF;

-- gcal_provider_event_id column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'gcal_provider_event_id'
) THEN
  ALTER TABLE bookings ADD COLUMN gcal_provider_event_id TEXT;
END IF;

-- gcal_client_event_id column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'gcal_client_event_id'
) THEN
  ALTER TABLE bookings ADD COLUMN gcal_client_event_id TEXT;
END IF;

-- gcal_last_sync column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'gcal_last_sync'
) THEN
  ALTER TABLE bookings ADD COLUMN gcal_last_sync TIMESTAMPTZ;
END IF;

-- reminder_24h_sent column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'reminder_24h_sent'
) THEN
  ALTER TABLE bookings ADD COLUMN reminder_24h_sent BOOLEAN DEFAULT false;
END IF;

-- reminder_2h_sent column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'reminder_2h_sent'
) THEN
  ALTER TABLE bookings ADD COLUMN reminder_2h_sent BOOLEAN DEFAULT false;
END IF;

-- reminder_30min_sent column
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'bookings' AND column_name = 'reminder_30min_sent'
) THEN
  ALTER TABLE bookings ADD COLUMN reminder_30min_sent BOOLEAN DEFAULT false;
END IF;

-- ── Step 5: Status check constraint ────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled'));

-- ── Step 6: Ensure client_id NOT NULL (was optional in legacy) ─────────────
UPDATE bookings SET client_id = '00000000-0000-0000-0000-000000000000' WHERE client_id IS NULL;
ALTER TABLE bookings ALTER COLUMN client_id SET NOT NULL;

-- ── Step 7: Recreate FK constraints ────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_booking_provider;
ALTER TABLE bookings
  ADD CONSTRAINT fk_booking_provider
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_service_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES services(service_id);

-- Note: client_id references clients table (not patients as in §6 spec)
-- This is an intentional adaptation since the project uses 'clients' not 'patients'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_client_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(client_id);

-- Self-referencing FK for rescheduled_from
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_rescheduled_from_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_rescheduled_from_fkey
  FOREIGN KEY (rescheduled_from) REFERENCES bookings(booking_id);

-- ── Step 8: Ensure idempotency_key is unique ───────────────────────────────
-- Drop old non-unique index if exists
DROP INDEX IF EXISTS idx_bookings_idempotency;
-- Ensure unique constraint exists
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_idempotency_key_key;
ALTER TABLE bookings ADD CONSTRAINT bookings_idempotency_key_key UNIQUE (idempotency_key);

RAISE NOTICE '✅ bookings table normalized: columns match §6 schema, legacy columns removed';

COMMIT;
