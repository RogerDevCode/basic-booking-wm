-- ============================================================================
-- RLS MIGRATION — Enable Row-Level Security on ALL transactional tables
-- ============================================================================
-- Implements AGENTS.md §7: Multi-Tenant Data Isolation via PostgreSQL RLS
--
-- AGENTS.md §7 MANDATE: NO bypass via "OR current_setting IS NULL".
-- Every query MUST have a valid tenant context. Zero exceptions.
--
-- Tables covered:
--   1. bookings        (provider_id NOT NULL)
--   2. services        (provider_id)
--   3. provider_schedules (provider_id)
--   4. booking_audit   (joins via booking_id → bookings.provider_id)
--   5. booking_dlq     (provider_id)
--   6. booking_intents (provider_id)
--   7. booking_locks   (provider_id)
--   8. providers       (provider_id — self-isolation)
--   9. clients         (client_id — self-isolation)
--   10. service_notes  (provider_id)
--   11. conversations  (client_id)
--   12. knowledge_base (provider_id)
--   13. honorifics     (read-only reference — no RLS needed, but enabled)
--   14. specialties    (read-only reference — no RLS needed, but enabled)
--   15. regions        (read-only reference — no RLS needed, but enabled)
--   16. communes       (read-only reference — no RLS needed, but enabled)
-- ============================================================================

BEGIN;

-- ── 1. bookings ─────────────────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_bookings ON bookings;
CREATE POLICY tenant_isolation_bookings ON bookings
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 2. services ─────────────────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_services ON services;
CREATE POLICY tenant_isolation_services ON services
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 3. provider_schedules ──────────────────────────────────────────────────
ALTER TABLE provider_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_schedules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_schedules ON provider_schedules;
CREATE POLICY tenant_isolation_schedules ON provider_schedules
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 4. booking_audit ────────────────────────────────────────────────────────
-- No provider_id column — must join through bookings.provider_id
ALTER TABLE booking_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_booking_audit ON booking_audit;
CREATE POLICY tenant_isolation_booking_audit ON booking_audit
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.booking_id = booking_audit.booking_id
      AND b.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.booking_id = booking_audit.booking_id
      AND b.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- ── 5. booking_dlq ──────────────────────────────────────────────────────────
ALTER TABLE booking_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_dlq FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_booking_dlq ON booking_dlq;
CREATE POLICY tenant_isolation_booking_dlq ON booking_dlq
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 6. booking_intents ─────────────────────────────────────────────────────
ALTER TABLE booking_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_intents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_booking_intents ON booking_intents;
CREATE POLICY tenant_isolation_booking_intents ON booking_intents
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 7. booking_locks ───────────────────────────────────────────────────────
ALTER TABLE booking_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_locks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_booking_locks ON booking_locks;
CREATE POLICY tenant_isolation_booking_locks ON booking_locks
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 8. providers — NEW (was missing) ───────────────────────────────────────
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_providers ON providers;
CREATE POLICY tenant_isolation_providers ON providers
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 9. clients — NEW (was missing) ─────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_clients ON clients;
CREATE POLICY tenant_isolation_clients ON clients
  USING (client_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (client_id = current_setting('app.current_tenant', true)::uuid);

-- ── 10. service_notes — NEW ────────────────────────────────────────────────
ALTER TABLE service_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_service_notes ON service_notes;
CREATE POLICY tenant_isolation_service_notes ON service_notes
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 11. conversations — NEW ────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_conversations ON conversations;
CREATE POLICY tenant_isolation_conversations ON conversations
  USING (client_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (client_id = current_setting('app.current_tenant', true)::uuid);

-- ── 12. knowledge_base — NEW ───────────────────────────────────────────────
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_knowledge_base ON knowledge_base;
CREATE POLICY tenant_isolation_knowledge_base ON knowledge_base
  USING (provider_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (provider_id = current_setting('app.current_tenant', true)::uuid);

-- ── 13. honorifics — read-only reference, but enabled for completeness ──────
ALTER TABLE honorifics ENABLE ROW LEVEL SECURITY;
ALTER TABLE honorifics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_honorifics ON honorifics;
CREATE POLICY tenant_isolation_honorifics ON honorifics
  USING (true)  -- Reference table: all tenants can read
  WITH CHECK (false);  -- No tenant can write (admin-only via separate mechanism)

-- ── 14. specialties — read-only reference ──────────────────────────────────
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_specialties ON specialties;
CREATE POLICY tenant_isolation_specialties ON specialties
  USING (true)
  WITH CHECK (false);

-- ── 15. regions — read-only reference ──────────────────────────────────────
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_regions ON regions;
CREATE POLICY tenant_isolation_regions ON regions
  USING (true)
  WITH CHECK (false);

-- ── 16. communes — read-only reference ─────────────────────────────────────
ALTER TABLE communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_communes ON communes;
CREATE POLICY tenant_isolation_communes ON communes
  USING (true)
  WITH CHECK (false);

COMMIT;
