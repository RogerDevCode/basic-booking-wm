-- ============================================================================
-- Migration: 005_create_clinical_notes.sql
-- Purpose: Clinical notes table for provider documentation
-- Severity: HIGH - Required for provider dashboard
-- Date: 2026-04-03
-- 
-- Changes:
--   1. Create clinical_notes table
--   2. Create indexes for booking, patient, and provider lookups
--   3. Add trigger for updated_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinical_notes (
    note_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(booking_id),
    patient_id      UUID NOT NULL REFERENCES patients(patient_id),
    provider_id     UUID NOT NULL REFERENCES providers(provider_id),
    content         TEXT NOT NULL,
    is_visible      BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinical_notes_booking ON clinical_notes(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_provider ON clinical_notes(provider_id, created_at DESC);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_clinical_notes_updated_at ON clinical_notes;
CREATE TRIGGER update_clinical_notes_updated_at BEFORE UPDATE ON clinical_notes
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
        AND table_name = 'clinical_notes'
    ) INTO v_table_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 005 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Clinical notes table created: %', v_table_exists;
    RAISE NOTICE 'Indexes: booking, patient, provider';
    RAISE NOTICE '========================================';
END $$;
