-- ============================================================================
-- SCHEDULING ENGINE MIGRATION
-- ============================================================================
-- Adds support for:
-- 1. Date range overrides (vacations, multi-day blocks)
-- 2. Explicit availability flag (is_available)
-- 3. Reason field for audit trail
-- ============================================================================

-- Add columns to schedule_overrides if they don't exist
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS override_date_end DATE;
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS reason VARCHAR(200);

-- Set default values for existing rows
UPDATE schedule_overrides
SET override_date_end = override_date
WHERE override_date_end IS NULL;

UPDATE schedule_overrides
SET is_available = NOT is_blocked
WHERE is_available = true AND is_blocked = true;

UPDATE schedule_overrides
SET reason = 'Blocked'
WHERE reason IS NULL AND is_blocked = true;

-- Create index for range queries
CREATE INDEX IF NOT EXISTS idx_overrides_date_range
  ON schedule_overrides (provider_id, override_date, override_date_end)
  WHERE is_available = false;

-- Create index for availability queries
CREATE INDEX IF NOT EXISTS idx_overrides_availability
  ON schedule_overrides (provider_id, override_date)
  WHERE is_available = true;
