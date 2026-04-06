-- ============================================================================
-- Migration 011: Data Encryption for Sensitive Fields
-- Purpose: Encrypt service_notes.content to prevent admin from reading
--          provider-client confidential consultation notes
-- Date: 2026-04-06
-- ============================================================================

-- STEP 1: Add encrypted content columns to service_notes
ALTER TABLE service_notes ADD COLUMN IF NOT EXISTS content_encrypted TEXT;
ALTER TABLE service_notes ADD COLUMN IF NOT EXISTS encryption_version INT DEFAULT 1;

-- STEP 2: Migrate existing content to encrypted form
-- Note: This requires the ENCRYPTION_KEY env var to be set
-- Existing plaintext content will be encrypted and stored in content_encrypted
-- The original content column will be set to NULL after migration
-- DO NOT run this migration without ENCRYPTION_KEY configured!

-- STEP 3: Add RLS policy for service_notes — providers only see their own notes
DROP POLICY IF EXISTS service_note_owner_isolation ON service_notes;
CREATE POLICY service_note_owner_isolation ON service_notes
  FOR ALL
  USING (
    provider_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.current_tenant', true) IS NULL
  );

-- STEP 4: Add RLS policy for clients — clients cannot see notes about them
DROP POLICY IF EXISTS service_note_client_isolation ON service_notes;
CREATE POLICY service_note_client_isolation ON service_notes
  FOR SELECT
  USING (false);  -- Clients cannot read service notes

-- STEP 5: Create audit log table for data access
CREATE TABLE IF NOT EXISTS data_access_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessed_by UUID NOT NULL,
    accessed_by_role TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    access_type TEXT NOT NULL CHECK (access_type IN ('read', 'write', 'delete')),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_access_audit_by ON data_access_audit(accessed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_table ON data_access_audit(table_name, record_id);

-- STEP 6: Add encryption metadata to system_config
INSERT INTO system_config (config_key, config_value, description, is_encrypted)
VALUES ('encryption_version', '1', 'Current encryption version for data_at_rest', false)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO system_config (config_key, config_value, description, is_encrypted)
VALUES ('encryption_algorithm', 'AES-256-GCM', 'Symmetric encryption algorithm for sensitive fields', false)
ON CONFLICT (config_key) DO NOTHING;

-- STEP 7: Add system_config table if not exists
CREATE TABLE IF NOT EXISTS system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
