-- ============================================================================
-- Migration 020 — Add metadata JSONB to clients table
-- Fecha: 2026-05-20
--
-- Purpose: Store reminder preferences and other client metadata in a flexible
--          JSONB column. Used by f/reminder_config/_config_repository.py
-- ============================================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Verification
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'metadata';
