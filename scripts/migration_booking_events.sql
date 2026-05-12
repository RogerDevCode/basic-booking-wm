-- Migration: Add booking_events event-store table + timestamp columns on bookings
-- Provides full audit trail (append-only, immutable) aligned with HL7 FHIR R4
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards everywhere).

BEGIN;

CREATE TABLE IF NOT EXISTS booking_events (
    event_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID        NOT NULL REFERENCES bookings(booking_id),
    event_type      TEXT        NOT NULL CHECK (event_type IN (
                        'CREATE', 'CONFIRM', 'START', 'COMPLETE',
                        'CANCEL', 'MARK_NO_SHOW', 'RESCHEDULE',
                        'AUTO_CANCEL_EXPIRED'
                    )),
    previous_status TEXT,
    new_status      TEXT,
    actor_type      TEXT        CHECK (actor_type IN ('client', 'provider', 'system', 'admin')),
    actor_id        UUID,
    idempotency_key TEXT        NOT NULL UNIQUE,
    payload         JSONB       NOT NULL DEFAULT '{}',
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking
    ON booking_events(booking_id, occurred_at DESC);

-- FSM lifecycle columns (idempotent — safe to run on existing schemas)
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rescheduled_to  UUID REFERENCES bookings(booking_id),
    ADD COLUMN IF NOT EXISTS cancelled_by    TEXT CHECK (cancelled_by IN ('client', 'provider', 'system', 'admin'));

COMMIT;
