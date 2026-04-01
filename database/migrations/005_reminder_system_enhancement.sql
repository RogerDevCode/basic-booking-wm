-- ============================================================================
-- BOOKING TITANIUM - REMINDER SYSTEM ENHANCEMENT MIGRATION
-- ============================================================================
-- This script adds:
-- 1. reminder_30min_sent column to bookings table
-- 2. reminder_preferences JSONB column to patients table
-- 3. Updated index for 30min reminders
-- 
-- Migration Date: 2026-04-01
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD reminder_30min_sent TO bookings
-- ============================================================================

ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS reminder_30min_sent BOOLEAN DEFAULT false;

-- ============================================================================
-- 2. ADD reminder_preferences TO patients
-- ============================================================================

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS reminder_preferences JSONB DEFAULT '{"telegram_24h": true, "gmail_24h": true, "telegram_2h": true, "telegram_30min": true}'::jsonb;

-- ============================================================================
-- 3. UPDATE REMINDER INDEX TO INCLUDE 30min
-- ============================================================================

-- Drop old index if exists (it will be recreated)
DROP INDEX IF EXISTS idx_bookings_reminders;

-- Recreate with 30min included
CREATE INDEX IF NOT EXISTS idx_bookings_reminders 
    ON bookings(start_time) 
    WHERE status = 'confirmed' 
      AND (reminder_24h_sent = false 
        OR reminder_2h_sent = false 
        OR reminder_30min_sent = false);

-- ============================================================================
-- 4. HELPER FUNCTION: Get patient reminder preference
-- ============================================================================

CREATE OR REPLACE FUNCTION should_send_reminder(
    p_patient_id UUID,
    p_channel TEXT,  -- 'telegram' or 'gmail'
    p_window TEXT    -- '24h', '2h', '30min'
) RETURNS BOOLEAN AS $$
DECLARE
    v_prefs JSONB;
    v_key TEXT;
BEGIN
    -- Get patient preferences
    SELECT COALESCE(reminder_preferences, '{}'::jsonb)
    INTO v_prefs
    FROM patients
    WHERE patient_id = p_patient_id;

    -- Build key: e.g., 'telegram_24h'
    v_key := p_channel || '_' || p_window;

    -- If key doesn't exist, default to true
    IF v_prefs ? v_key THEN
        RETURN (v_prefs->>v_key)::boolean;
    END IF;

    RETURN true; -- Default: send reminder
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 5. TRIGGER: Reset reminder flags on Cancel/Reschedule
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_reminders_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When booking is cancelled or rescheduled, reset ALL reminder flags
    IF NEW.status IN ('cancelled', 'rescheduled', 'no_show') AND OLD.status NOT IN ('cancelled', 'rescheduled', 'no_show') THEN
        NEW.reminder_24h_sent := false;
        NEW.reminder_2h_sent := false;
        NEW.reminder_30min_sent := false;
    END IF;

    -- When booking is rescheduled (new booking created), ensure reminders are false
    -- so they can be re-sent for the new time
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        -- Fresh confirmation, ensure flags are false (they should be by default)
        NEW.reminder_24h_sent := COALESCE(NEW.reminder_24h_sent, false);
        NEW.reminder_2h_sent := COALESCE(NEW.reminder_2h_sent, false);
        NEW.reminder_30min_sent := COALESCE(NEW.reminder_30min_sent, false);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_reminders_on_status_change ON bookings;
CREATE TRIGGER trg_reset_reminders_on_status_change
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION reset_reminders_on_status_change();

-- ============================================================================
-- 5. TRIGGER: Reset reminder flags on Cancel/Reschedule
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_reminders_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When booking is cancelled or rescheduled, reset ALL reminder flags
    IF NEW.status IN ('cancelled', 'rescheduled', 'no_show') AND OLD.status NOT IN ('cancelled', 'rescheduled', 'no_show') THEN
        NEW.reminder_24h_sent := false;
        NEW.reminder_2h_sent := false;
        NEW.reminder_30min_sent := false;
    END IF;

    -- When booking is rescheduled (new booking created), ensure reminders are false
    -- so they can be re-sent for the new time
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        -- Fresh confirmation, ensure flags are false (they should be by default)
        NEW.reminder_24h_sent := COALESCE(NEW.reminder_24h_sent, false);
        NEW.reminder_2h_sent := COALESCE(NEW.reminder_2h_sent, false);
        NEW.reminder_30min_sent := COALESCE(NEW.reminder_30min_sent, false);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reset_reminders_on_status_change ON bookings;
CREATE TRIGGER trg_reset_reminders_on_status_change
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION reset_reminders_on_status_change();

-- ============================================================================
-- 6. COMPLETION MESSAGE
-- ============================================================================

DO $$
DECLARE
    v_bookings_with_reminders INT;
    v_patients_with_prefs INT;
BEGIN
    SELECT COUNT(*) INTO v_bookings_with_reminders 
    FROM bookings 
    WHERE reminder_24h_sent = false OR reminder_2h_sent = false OR reminder_30min_sent = false;
    
    SELECT COUNT(*) INTO v_patients_with_prefs 
    FROM patients 
    WHERE reminder_preferences IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '  REMINDER SYSTEM MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  Changes:';
    RAISE NOTICE '    ✓ bookings.reminder_30min_sent added';
    RAISE NOTICE '    ✓ patients.reminder_preferences added';
    RAISE NOTICE '    ✓ idx_bookings_reminders updated (includes 30min)';
    RAISE NOTICE '    ✓ should_send_reminder() helper function created';
    RAISE NOTICE '';
    RAISE NOTICE '  Statistics:';
    RAISE NOTICE '    - Bookings needing reminders: %', v_bookings_with_reminders;
    RAISE NOTICE '    - Patients with preferences: %', v_patients_with_prefs;
    RAISE NOTICE '';
    RAISE NOTICE '  Default reminder_preferences:';
    RAISE NOTICE '    {';
    RAISE NOTICE '      "telegram_24h": true,';
    RAISE NOTICE '      "gmail_24h": true,';
    RAISE NOTICE '      "telegram_2h": true,';
    RAISE NOTICE '      "telegram_30min": true';
    RAISE NOTICE '    }';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

COMMIT;
