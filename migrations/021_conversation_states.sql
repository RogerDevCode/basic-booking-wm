-- Migration 021: conversation_states table
-- Single Source of Truth for FSM conversation state.
-- Redis becomes a TTL cache only. This table replaces the Redis-primary architecture.
--
-- Three pillars:
--   1. pg_advisory_xact_lock(chat_id_lock_key(chat_id)) for per-chat serialization
--   2. Optimistic locking via `version` column
--   3. Cache-aside with invalidation (Redis DEL on write, rebuild on miss)

CREATE TABLE IF NOT EXISTS conversation_states (
    chat_id       VARCHAR(255) PRIMARY KEY,
    booking_state JSONB NOT NULL DEFAULT '{"name": "idle"}'::jsonb,
    active_flow   VARCHAR(50),
    booking_draft JSONB,
    pending_data  JSONB DEFAULT '{}'::jsonb,
    message_id    BIGINT,
    version       INT NOT NULL DEFAULT 1,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to generate stable hash of chat_id for advisory locks.
-- pg_advisory_xact_lock takes bigint; hashtext() returns int4 which is auto-cast.
CREATE OR REPLACE FUNCTION chat_id_lock_key(p_chat_id VARCHAR)
RETURNS INT AS $$
    SELECT hashtext(p_chat_id);
$$ LANGUAGE sql IMMUTABLE STRICT;

COMMENT ON TABLE conversation_states IS
    'Single source of truth for FSM conversation state. '
    'Redis is a TTL cache only. Advisory lock + optimistic locking prevent race conditions.';
