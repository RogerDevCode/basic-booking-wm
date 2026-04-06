-- ============================================================================
-- Migration 009: Complete Remaining Tables and Indexes
-- Purpose: Apply pending items from migrations 002, 003, 005, 007
-- Date: 2026-04-06
-- ============================================================================

-- From Migration 003: conversations table
CREATE TABLE IF NOT EXISTS conversations (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(chat_id),
    channel TEXT NOT NULL CHECK (channel IN ('telegram', 'web', 'api')),
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content TEXT NOT NULL,
    intent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_intent ON conversations(intent);

-- From Migration 002: Missing index
CREATE INDEX IF NOT EXISTS idx_bookings_provider_time ON bookings(provider_id, start_time, end_time);

-- From Migration 007: knowledge_base indexes
CREATE INDEX IF NOT EXISTS idx_kb_provider ON knowledge_base(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_active ON knowledge_base(is_active) WHERE is_active = true;

-- Migration 005 was renamed from clinical_notes → service_notes
-- service_notes table was already created in migration 007
-- No additional action needed
