-- ============================================================================
-- STATE MACHINE TRIGGER — Enforce Booking Status Transitions at DB Level
-- ============================================================================
-- Implements AGENTS.md §8.1: State Machine (Strict)
-- Allowed transitions:
--   pending     -> confirmed, cancelled, rescheduled
--   confirmed   -> in_service, cancelled, rescheduled
--   in_service  -> completed, no_show
--   completed, no_show, cancelled, rescheduled are terminal (no transitions)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION validate_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on UPDATE of status
  IF TG_OP = 'UPDATE' THEN
    -- If status hasn't changed, allow it
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;

    -- Validate transition based on old status
    CASE OLD.status
      WHEN 'pending' THEN
        IF NEW.status NOT IN ('confirmed', 'cancelled', 'rescheduled') THEN
          RAISE EXCEPTION 'Invalid state transition: % -> %', OLD.status, NEW.status;
        END IF;
      WHEN 'confirmed' THEN
        IF NEW.status NOT IN ('in_service', 'cancelled', 'rescheduled') THEN
          RAISE EXCEPTION 'Invalid state transition: % -> %', OLD.status, NEW.status;
        END IF;
      WHEN 'in_service' THEN
        IF NEW.status NOT IN ('completed', 'no_show') THEN
          RAISE EXCEPTION 'Invalid state transition: % -> %', OLD.status, NEW.status;
        END IF;
      ELSE
        -- Terminal states: completed, no_show, cancelled, rescheduled
        RAISE EXCEPTION 'Invalid state transition: % -> % (state % is terminal)', OLD.status, NEW.status, OLD.status;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists to allow re-running migration
DROP TRIGGER IF EXISTS enforce_booking_state_machine ON bookings;

-- Create trigger
CREATE TRIGGER enforce_booking_state_machine
BEFORE UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION validate_booking_status_transition();

COMMIT;
