-- ============================================================================
-- Migration 008: Clients N:M Relationship (remove provider_id from clients)
-- Purpose: Clients are global entities, not tied to a single provider
--          The N:M relationship is established through the bookings table
-- Date: 2026-04-06
-- ============================================================================

-- Remove provider_id from clients (was incorrectly added in 007)
ALTER TABLE clients DROP COLUMN IF EXISTS provider_id CASCADE;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_clients_provider;
DROP POLICY IF EXISTS client_tenant_isolation ON clients;

-- Create unique index on email for FK references
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

-- The N:M relationship between clients and providers is handled by:
--   bookings: links client (user_id) → provider (provider_id)
--   service_notes: links client → provider via booking_id
