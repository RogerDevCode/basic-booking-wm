-- ============================================================================
-- RLS MIGRATION — Enable Row-Level Security on all transactional tables
-- ============================================================================
-- Implements AGENTS.md §7: Multi-Tenant Data Isolation via PostgreSQL RLS
-- 
-- Tables migrated:
--   1. bookings       (has provider_id NOT NULL)
--   2. services       (has provider_id nullable)
--   3. provider_schedules (has provider_id nullable)
--   4. booking_audit  (no provider_id — joins via booking_id → bookings.provider_id)
--   5. booking_dlq    (has provider_id nullable)
--   6. booking_intents (has provider_id nullable)
--   7. booking_locks  (has provider_id nullable)
--
-- Policy pattern: tenant_isolation — reads/writes only when
--   current_setting('app.current_tenant', true) matches provider_id
--   OR current_setting is NULL (allows admin/superuser bypass)
-- ============================================================================

BEGIN;

-- ── 1. bookings ─────────────────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_bookings ON bookings
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 2. services ─────────────────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_services ON services
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 3. provider_schedules ──────────────────────────────────────────────────
ALTER TABLE provider_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_schedules ON provider_schedules
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 4. booking_audit ────────────────────────────────────────────────────────
-- No provider_id column — must join through bookings.provider_id
ALTER TABLE booking_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_booking_audit ON booking_audit
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.booking_id = booking_audit.booking_id
      AND b.provider_id = current_setting('app.current_tenant', true)::uuid
    )
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.booking_id = booking_audit.booking_id
      AND b.provider_id = current_setting('app.current_tenant', true)::uuid
    )
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 5. booking_dlq ──────────────────────────────────────────────────────────
ALTER TABLE booking_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_dlq FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_booking_dlq ON booking_dlq
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 6. booking_intents ─────────────────────────────────────────────────────
ALTER TABLE booking_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_intents FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_booking_intents ON booking_intents
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- ── 7. booking_locks ───────────────────────────────────────────────────────
ALTER TABLE booking_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_locks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_booking_locks ON booking_locks
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  )
  WITH CHECK (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

COMMIT;
