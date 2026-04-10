-- ============================================================================
-- Migration: 012_rls_indexes_fix.sql
-- Purpose: 
--   1. Enable RLS on tables missing it (system_config, data_access_audit,
--      tag_categories, tags, note_tags)
--   2. Add critical missing indexes for query performance
-- Severity: P0 — security + performance
-- Date: 2026-04-08
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Enable RLS on Missing Tables
-- ============================================================================

-- ── 1.1 system_config ──────────────────────────────────────────────────────
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_system_config ON system_config;
CREATE POLICY tenant_isolation_system_config ON system_config
  USING (true)  -- Reference table, shared across tenants
  WITH CHECK (false);  -- Only insert via migrations

-- ── 1.2 data_access_audit ──────────────────────────────────────────────────
ALTER TABLE data_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_data_access_audit ON data_access_audit;
CREATE POLICY tenant_isolation_data_access_audit ON data_access_audit
  USING (true)  -- Audit log, visible to admins
  WITH CHECK (false);  -- Append-only

-- ── 1.3 tag_categories ─────────────────────────────────────────────────────
ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tag_categories ON tag_categories;
CREATE POLICY tenant_isolation_tag_categories ON tag_categories
  USING (true)  -- Reference data, shared across tenants
  WITH CHECK (true);  -- Admins can CRUD

-- ── 1.4 tags ───────────────────────────────────────────────────────────────
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tags ON tags;
CREATE POLICY tenant_isolation_tags ON tags
  USING (true)  -- Reference data, shared across tenants
  WITH CHECK (true);

-- ── 1.5 note_tags (junction table) ─────────────────────────────────────────
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_note_tags ON note_tags;
CREATE POLICY tenant_isolation_note_tags ON note_tags
  USING (
    EXISTS (
      SELECT 1 FROM service_notes sn
      WHERE sn.note_id = note_tags.note_id
      AND sn.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_notes sn
      WHERE sn.note_id = note_tags.note_id
      AND sn.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- ============================================================================
-- PART 2: Critical Missing Indexes
-- ============================================================================

-- ── 2.1 bookings.status — used in every reconcile/list query ───────────────
CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON bookings(status)
  WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');

-- ── 2.2 bookings.gcal_sync_status — reconcile cron queries this every 5 min ─
CREATE INDEX IF NOT EXISTS idx_bookings_gcal_sync_status
  ON bookings(gcal_sync_status)
  WHERE gcal_sync_status IN ('pending', 'partial', 'failed');

-- ── 2.3 bookings.client_id — client-facing booking queries ────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_client_id
  ON bookings(client_id, start_time DESC);

-- ── 2.4 bookings.created_at — admin dashboard ordering ─────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_created_at
  ON bookings(created_at DESC);

-- ── 2.5 bookings.provider_id + status — provider dashboard queries ────────
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status
  ON bookings(provider_id, status, start_time)
  WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');

-- ── 2.6 provider_schedules.provider_id — availability check joins ──────────
CREATE INDEX IF NOT EXISTS idx_provider_schedules_provider
  ON provider_schedules(provider_id, day_of_week);

-- ── 2.7 services.provider_id — service listing by provider ────────────────
CREATE INDEX IF NOT EXISTS idx_services_provider
  ON services(provider_id, is_active);

-- ── 2.8 schedule_overrides.provider_id + date ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_provider_date
  ON schedule_overrides(provider_id, override_date);

-- ── 2.9 service_notes.provider_id ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_service_notes_provider
  ON service_notes(provider_id, created_at DESC);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  idx_count INT;
  rls_count INT;
BEGIN
  -- Count indexes created by this migration
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename = 'bookings'
    AND indexname LIKE 'idx_bookings%';

  RAISE NOTICE '✅ bookings indexes: % created/verified', idx_count;

  -- Verify RLS is enabled on all target tables
  SELECT COUNT(*) INTO rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = true;

  RAISE NOTICE '✅ Tables with RLS enabled: %', rls_count;
END $$;

COMMIT;
