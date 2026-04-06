-- ============================================================================
-- Migration: 006_create_waitlist.sql
-- Purpose: Waitlist table for client queue management
-- Severity: HIGH - Required for waitlist feature
-- Date: 2026-04-03
-- 
-- Changes:
--   1. Create waitlist table
--   2. Create indexes for client, service, status, and position lookups
--   3. Add trigger for updated_at
--   4. Add helper function for position calculation
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlist (
    waitlist_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id      UUID NOT NULL REFERENCES clients(client_id),
    service_id      UUID NOT NULL REFERENCES services(service_id),
    preferred_date  DATE,
    preferred_start_time TIME,
    preferred_end_time TIME,
    status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'notified', 'assigned', 'cancelled')),
    position        INT NOT NULL DEFAULT 0,
    notified_at     TIMESTAMPTZ,
    assigned_booking_id UUID REFERENCES bookings(booking_id),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_client ON waitlist(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_service_status ON waitlist(service_id, status, position);
CREATE INDEX IF NOT EXISTS idx_waitlist_waiting ON waitlist(service_id, position) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_waitlist_notified ON waitlist(status, notified_at) WHERE status = 'notified';

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_waitlist_updated_at ON waitlist;
CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON waitlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper function: recalculate positions for a service's waiting queue
CREATE OR REPLACE FUNCTION recalculate_waitlist_positions(p_service_id UUID)
RETURNS void AS $$
BEGIN
    WITH ranked AS (
        SELECT waitlist_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC) AS new_position
        FROM waitlist
        WHERE service_id = p_service_id
          AND status = 'waiting'
    )
    UPDATE waitlist w
    SET position = r.new_position
    FROM ranked r
    WHERE w.waitlist_id = r.waitlist_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function: get next available slot from waitlist
CREATE OR REPLACE FUNCTION get_next_waitlist_client(p_service_id UUID)
RETURNS TABLE(
    waitlist_id UUID,
    client_id UUID,
    preferred_date DATE,
    preferred_start_time TIME,
    preferred_end_time TIME,
    position INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT w.waitlist_id, w.client_id, w.preferred_date,
           w.preferred_start_time, w.preferred_end_time, w.position
    FROM waitlist w
    WHERE w.service_id = p_service_id
      AND w.status = 'waiting'
    ORDER BY w.position ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

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
        AND table_name = 'waitlist'
    ) INTO v_table_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 006 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Waitlist table created: %', v_table_exists;
    RAISE NOTICE 'Indexes: client, service_status, waiting, notified';
    RAISE NOTICE 'Helper functions: recalculate_waitlist_positions, get_next_waitlist_client';
    RAISE NOTICE '========================================';
END $$;
