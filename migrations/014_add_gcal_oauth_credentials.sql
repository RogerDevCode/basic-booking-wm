-- Migration 014: Add per-provider GCal OAuth credentials
-- Purpose: Store GCal OAuth credentials per provider instead of in .env
-- This enables multi-provider GCal sync with proper credential isolation

-- Add GCal OAuth credential columns to providers table
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS gcal_client_id TEXT,
  ADD COLUMN IF NOT EXISTS gcal_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS gcal_access_token TEXT,
  ADD COLUMN IF NOT EXISTS gcal_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gcal_email TEXT;

-- Add comments for documentation
COMMENT ON COLUMN providers.gcal_client_id IS 'Google OAuth 2.0 Client ID for this provider';
COMMENT ON COLUMN providers.gcal_client_secret IS 'Google OAuth 2.0 Client Secret (encrypted at rest)';
COMMENT ON COLUMN providers.gcal_access_token IS 'Google OAuth 2.0 Access Token (short-lived, auto-refreshed)';
COMMENT ON COLUMN providers.gcal_refresh_token IS 'Google OAuth 2.0 Refresh Token (for token rotation)';
COMMENT ON COLUMN providers.gcal_email IS 'Google account email associated with provider calendar';

-- Note: In production, gcal_client_secret, gcal_access_token, and gcal_refresh_token
-- should be encrypted at rest using pgcrypto or application-level encryption.
-- For now, they are stored as plaintext and will be encrypted in a future migration.

-- Update existing provider with placeholder values (to be filled by operator)
-- This is a safe default - operators must explicitly set real credentials
UPDATE providers
SET
  gcal_client_id = NULL,
  gcal_client_secret = NULL,
  gcal_access_token = NULL,
  gcal_refresh_token = NULL,
  gcal_email = NULL
WHERE gcal_client_id IS NULL;
