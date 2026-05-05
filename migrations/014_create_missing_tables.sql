-- ============================================================================
-- Migration 014: Create Missing Tables (users, service_notes)
-- Purpose: Create tables referenced by code but never defined in migrations
-- Severity: P0 — code fails on fresh database without these tables
-- Date: 2026-04-08
--
-- Tables created:
--   users           — authentication and authorization (web auth endpoints)
--   service_notes   — encrypted provider notes about client bookings
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. users table — authentication/authorization
-- ============================================================================
-- Used by: web_auth_login, web_auth_register, web_auth_me, web_auth_change_role,
--          web_auth_complete_profile, web_admin_users, web_admin_dashboard,
--          web_admin_tags, telegram_auto_register, web_waitlist, web_booking_api,
--          web_patient_bookings, web_patient_profile, web_provider_dashboard

CREATE TABLE IF NOT EXISTS users (
    user_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        TEXT NOT NULL,
    rut              TEXT UNIQUE,
    email            TEXT UNIQUE,
    address          TEXT,
    phone            TEXT,
    password_hash    TEXT,
    role             TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'provider', 'admin')),
    is_active        BOOLEAN DEFAULT true,
    timezone         TEXT DEFAULT 'America/Santiago',
    telegram_chat_id TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for users — tenant isolation by user_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Users can read their own record
DROP POLICY IF EXISTS user_self_read ON users;
CREATE POLICY user_self_read ON users
  FOR SELECT
  USING (user_id = current_setting('app.current_tenant', true)::uuid);

-- Users can update their own record
DROP POLICY IF EXISTS user_self_update ON users;
CREATE POLICY user_self_update ON users
  FOR UPDATE
  USING (user_id = current_setting('app.current_tenant', true)::uuid);

-- Admins can manage all users (requires app.admin_override setting)
DROP POLICY IF EXISTS user_admin_manage ON users;
CREATE POLICY user_admin_manage ON users
  FOR ALL
  USING (current_setting('app.admin_override', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_rut ON users(rut) WHERE rut IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, is_active);

-- ============================================================================
-- 2. service_notes table — encrypted provider notes
-- ============================================================================
-- Used by: web_provider_notes, note_tags junction table

CREATE TABLE IF NOT EXISTS service_notes (
    note_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL,
    booking_id          UUID,
    client_id           UUID,
    content_encrypted   TEXT,
    encryption_version  INT DEFAULT 1,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for service_notes — providers only see their own notes
ALTER TABLE service_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_note_owner_read ON service_notes;
CREATE POLICY service_note_owner_read ON service_notes
  FOR SELECT
  USING (provider_id = current_setting('app.current_tenant', true)::uuid);

DROP POLICY IF EXISTS service_note_owner_write ON service_notes;
CREATE POLICY service_note_owner_write ON service_notes
  FOR ALL
  USING (provider_id = current_setting('app.current_tenant', true)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_notes_provider ON service_notes(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_notes_booking ON service_notes(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_notes_client ON service_notes(client_id) WHERE client_id IS NOT NULL;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  users_exists BOOLEAN;
  notes_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'users' AND table_schema = 'public'
  ) INTO users_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'service_notes' AND table_schema = 'public'
  ) INTO notes_exists;

  IF users_exists AND notes_exists THEN
    RAISE NOTICE '✅ Migration 014 complete: users and service_notes tables created';
  ELSE
    RAISE EXCEPTION '❌ Migration 014 failed: missing tables';
  END IF;
END $$;

COMMIT;
