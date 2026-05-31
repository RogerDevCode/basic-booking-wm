-- Migration 022: Waitlist unique constraint (DB safety-net)
-- Audit finding H4 [Low]: Unbounded Waitlist Subscriptions
--
-- Context: Python layer already validates duplicates via SELECT before INSERT
-- (web_waitlist/_waitlist_logic.py:37-47), but a DB-level UNIQUE constraint is
-- required as a defense-in-depth guarantee against race conditions (concurrent
-- requests, retry storms) and schema-level correctness.
--
-- Note: A partial UNIQUE index is used instead of a table constraint because
-- it scopes the uniqueness only to active subscriptions (waiting/notified),
-- allowing a user to re-join after they've been served or cancelled.

-- Partial unique index: one active subscription per (client, service)
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_active_client_service
    ON waitlist (client_id, service_id)
    WHERE status IN ('waiting', 'notified');

-- Index to speed up position recalculation queries
CREATE INDEX IF NOT EXISTS idx_waitlist_service_status_position
    ON waitlist (service_id, status, position)
    WHERE status = 'waiting';
