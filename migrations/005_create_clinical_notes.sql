-- ============================================================================
-- Migration: 005_create_service_notes.sql
-- Purpose: Clinical notes table for provider documentation
-- Severity: HIGH - Required for provider dashboard
-- Date: 2026-04-03
-- 
-- Changes:
--   1. Create service_notes table
--   2. Create indexes for booking, client, and provider lookups
--   3. Add trigger for updated_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_notes (
    note_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(booking_id),
    client_id      UUID NOT NULL REFERENCES clients(client_id),
    provider_id     UUID NOT NULL REFERENCES providers(provider_id),
    content         TEXT NOT NULL,
    is_visible      BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_notes_booking ON service_notes(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_notes_client ON service_notes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_notes_provider ON service_notes(provider_id, created_at DESC);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_service_notes_updated_at ON service_notes;
CREATE TRIGGER update_service_notes_updated_at BEFORE UPDATE ON service_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
DECLARE
    v_table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'service_notes'
    ) INTO v_table_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 005 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Clinical notes table created: %', v_table_exists;
    RAISE NOTICE 'Indexes: booking, client, provider';
    RAISE NOTICE '========================================';
END $$;
