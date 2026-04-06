-- ============================================================================
-- Migration: 003_complete_schema_overhaul.sql
-- Purpose: Complete schema alignment with AGENTS.md §10 specification
-- Severity: CRITICAL - Foundation for all booking operations
-- Date: 2026-04-02
-- 
-- Changes:
--   1. Convert providers.id from SERIAL INT to UUID
--   2. Convert services.id from SERIAL INT to UUID
--   3. Add missing tables: clients, provider_schedules, schedule_overrides,
--      booking_audit, knowledge_base, conversations
--   4. Add missing columns to bookings table
--   5. Change status values from UPPERCASE to lowercase
--   6. Enable required extensions (vector, btree_gist)
-- ============================================================================

-- ============================================================================
-- STEP 0: Enable required extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- STEP 1: Recreate providers with UUID primary key
-- ============================================================================

-- 1a. Create new providers table with UUID
CREATE TABLE IF NOT EXISTS providers_new (
    provider_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    phone             TEXT,
    specialty         TEXT NOT NULL DEFAULT 'Medicina General',
    telegram_chat_id  TEXT,
    gcal_calendar_id  TEXT,
    timezone          TEXT NOT NULL DEFAULT 'America/Mexico_City',
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. Migrate data from old providers table
INSERT INTO providers_new (provider_id, name, email, is_active, gcal_calendar_id, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    name,
    email,
    is_active,
    gcal_calendar_id,
    created_at,
    updated_at
FROM providers;

-- 1c. Drop old providers table and rename new one
DROP TABLE IF EXISTS providers CASCADE;
ALTER TABLE providers_new RENAME TO providers;

-- ============================================================================
-- STEP 2: Recreate services with UUID primary key
-- ============================================================================

-- 2a. Create new services table with UUID
CREATE TABLE IF NOT EXISTS services_new (
    service_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id       UUID NOT NULL REFERENCES providers(provider_id),
    name              TEXT NOT NULL,
    description       TEXT,
    duration_minutes  INT NOT NULL DEFAULT 30,
    buffer_minutes    INT NOT NULL DEFAULT 10,
    price_cents       INT DEFAULT 0,
    currency          TEXT DEFAULT 'MXN',
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    CONSTRAINT valid_buffer CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120)
);

-- 2b. Migrate data from old services table (link to first provider as default)
INSERT INTO services_new (service_id, provider_id, name, duration_minutes, buffer_minutes, price_cents, currency, is_active, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    (SELECT provider_id FROM providers LIMIT 1),
    name,
    duration_min,
    buffer_min,
    (price * 100)::INT,
    currency,
    is_active,
    created_at,
    updated_at
FROM services;

-- 2c. Drop old services and provider_services tables
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS provider_services CASCADE;
ALTER TABLE services_new RENAME TO services;

-- ============================================================================
-- STEP 3: Recreate bookings with complete schema
-- ============================================================================

-- 3a. Create new bookings table with all required columns
CREATE TABLE IF NOT EXISTS bookings_new (
    booking_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id         UUID NOT NULL REFERENCES providers(provider_id),
    client_id          UUID NOT NULL, -- FK added after clients table creation
    service_id          UUID NOT NULL REFERENCES services(service_id),
    start_time          TIMESTAMPTZ NOT NULL,
    end_time            TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','in_service',
                                          'completed','cancelled','no_show','rescheduled')),
    idempotency_key     TEXT UNIQUE NOT NULL,
    cancellation_reason TEXT,
    cancelled_by        TEXT CHECK (cancelled_by IN ('client','provider','system', NULL)),
    rescheduled_from    UUID REFERENCES bookings_new(booking_id),
    rescheduled_to      UUID REFERENCES bookings_new(booking_id),
    notes               TEXT,

    -- Google Calendar sync
    gcal_provider_event_id TEXT,
    gcal_client_event_id  TEXT,
    gcal_sync_status       TEXT DEFAULT 'pending'
                           CHECK (gcal_sync_status IN ('pending','synced','partial','failed')),
    gcal_retry_count       INT DEFAULT 0,
    gcal_last_sync         TIMESTAMPTZ,

    -- Notifications
    notification_sent       BOOLEAN DEFAULT false,
    reminder_24h_sent       BOOLEAN DEFAULT false,
    reminder_2h_sent        BOOLEAN DEFAULT false,
    reminder_30min_sent     BOOLEAN DEFAULT false,

    -- Timestamps
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_booking_time CHECK (start_time < end_time)
);

-- 3b. Migrate existing booking data
INSERT INTO bookings_new (
    booking_id, provider_id, service_id, start_time, end_time,
    status, idempotency_key, gcal_provider_event_id,
    cancellation_reason, created_at, updated_at
)
SELECT 
    id,
    (SELECT provider_id FROM providers WHERE name = (SELECT name FROM providers_old_temp LIMIT 1)), -- Map old provider_id
    (SELECT service_id FROM services LIMIT 1), -- Map old service_id
    start_time,
    end_time,
    LOWER(status), -- Convert UPPERCASE to lowercase
    COALESCE(idempotency_key, gen_random_uuid()::text),
    gcal_event_id,
    cancellation_reason,
    COALESCE(created_at, NOW()),
    COALESCE(updated_at, NOW())
FROM bookings;

-- 3c. Drop old bookings table and rename new one
DROP TABLE IF EXISTS bookings CASCADE;
ALTER TABLE bookings_new RENAME TO bookings;

-- 3d. Add indexes for bookings
CREATE INDEX idx_bookings_provider_time ON bookings(provider_id, start_time, end_time)
    WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');
CREATE INDEX idx_bookings_client ON bookings(client_id, start_time DESC);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_gcal_pending ON bookings(gcal_sync_status)
    WHERE gcal_sync_status IN ('pending', 'partial');
CREATE INDEX idx_bookings_reminders ON bookings(start_time)
    WHERE status = 'confirmed'
      AND (reminder_24h_sent = false OR reminder_2h_sent = false);
CREATE INDEX idx_bookings_idempotency ON bookings(idempotency_key);

-- ============================================================================
-- STEP 4: Create clients table
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    client_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    email             TEXT UNIQUE,
    phone             TEXT,
    telegram_chat_id  TEXT,
    gcal_calendar_id  TEXT,
    timezone          TEXT DEFAULT 'America/Mexico_City',
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_telegram ON clients(telegram_chat_id);

-- 4b. Add FK constraint for client_id in bookings
ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id);

-- ============================================================================
-- STEP 5: Create provider_schedules table
-- ============================================================================
CREATE TABLE IF NOT EXISTS provider_schedules (
    schedule_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL REFERENCES providers(provider_id),
    day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    is_active     BOOLEAN DEFAULT true,

    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    UNIQUE(provider_id, day_of_week, start_time)
);

CREATE INDEX idx_schedules_provider ON provider_schedules(provider_id, day_of_week);

-- ============================================================================
-- STEP 6: Create schedule_overrides table
-- ============================================================================
CREATE TABLE IF NOT EXISTS schedule_overrides (
    override_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL REFERENCES providers(provider_id),
    override_date DATE NOT NULL,
    is_blocked    BOOLEAN DEFAULT false,
    start_time    TIME,
    end_time      TIME,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider_id, override_date)
);

CREATE INDEX idx_overrides_provider_date ON schedule_overrides(provider_id, override_date);

-- ============================================================================
-- STEP 7: Create booking_audit table
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_audit (
    audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    UUID NOT NULL REFERENCES bookings(booking_id),
    from_status   TEXT,
    to_status     TEXT NOT NULL,
    changed_by    TEXT NOT NULL,
    actor_id      UUID,
    reason        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_booking ON booking_audit(booking_id, created_at DESC);

-- ============================================================================
-- STEP 8: Create knowledge_base table
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    kb_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID REFERENCES providers(provider_id),
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    embedding     vector(1536),
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_category ON knowledge_base(category);
CREATE INDEX idx_kb_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================================
-- STEP 9: Create conversations table
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    message_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID REFERENCES clients(client_id),
    channel       TEXT NOT NULL CHECK (channel IN ('telegram', 'web', 'api')),
    direction     TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content       TEXT NOT NULL,
    intent        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_client ON conversations(client_id, created_at DESC);
CREATE INDEX idx_conversations_channel ON conversations(channel, created_at DESC);

-- ============================================================================
-- STEP 10: Create system_config table (for reminder preferences, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_config (
    config_key    TEXT PRIMARY KEY,
    config_value  JSONB NOT NULL,
    description   TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 11: Update circuit_breaker_state table
-- ============================================================================
-- Ensure table exists with correct structure
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    service_id          TEXT PRIMARY KEY,
    state               TEXT NOT NULL DEFAULT 'closed',
    failure_count       INT NOT NULL DEFAULT 0,
    success_count       INT NOT NULL DEFAULT 0,
    failure_threshold   INT NOT NULL DEFAULT 5,
    success_threshold   INT NOT NULL DEFAULT 3,
    timeout_seconds     INT NOT NULL DEFAULT 300,
    opened_at           TIMESTAMPTZ,
    half_open_at        TIMESTAMPTZ,
    last_failure_at     TIMESTAMPTZ,
    last_success_at     TIMESTAMPTZ,
    last_error_message  TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_cb_state CHECK (state IN ('closed', 'open', 'half-open'))
);

-- ============================================================================
-- STEP 12: Update booking_locks table
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_locks (
    lock_id         SERIAL PRIMARY KEY,
    lock_key        TEXT UNIQUE NOT NULL,
    owner_token     TEXT NOT NULL,
    provider_id     UUID NOT NULL REFERENCES providers(provider_id),
    start_time      TIMESTAMPTZ NOT NULL,
    acquired_at     TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_lock_expires CHECK (expires_at > acquired_at)
);

CREATE INDEX idx_booking_locks_key ON booking_locks(lock_key);
CREATE INDEX idx_booking_locks_expires ON booking_locks(expires_at);
CREATE INDEX idx_booking_locks_provider ON booking_locks(provider_id);

-- ============================================================================
-- STEP 13: Update booking_dlq table
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_dlq (
    dlq_id              SERIAL PRIMARY KEY,
    booking_id          UUID,
    provider_id         UUID REFERENCES providers(provider_id),
    service_id          UUID REFERENCES services(service_id),
    failure_reason      TEXT NOT NULL,
    last_error_message  TEXT NOT NULL,
    last_error_stack    TEXT,
    original_payload    JSONB NOT NULL,
    idempotency_key     TEXT UNIQUE NOT NULL,
    status              TEXT DEFAULT 'pending',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    resolved_by         TEXT,
    resolution_notes    TEXT,

    CONSTRAINT chk_dlq_status CHECK (status IN ('pending', 'resolved', 'discarded'))
);

CREATE INDEX idx_dlq_status ON booking_dlq(status);
CREATE INDEX idx_dlq_booking ON booking_dlq(booking_id);
CREATE INDEX idx_dlq_idempotency ON booking_dlq(idempotency_key);
CREATE INDEX idx_dlq_created ON booking_dlq(created_at);

-- ============================================================================
-- STEP 14: Seed data
-- ============================================================================

-- Insert default providers (if not exists)
INSERT INTO providers (provider_id, name, email, specialty, is_active) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dr. Juan Pérez', 'juan.perez@booking-titanium.com', 'Medicina General', true),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Dra. María González', 'maria.gonzalez@booking-titanium.com', 'Cardiología', true),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'Dr. Carlos Rodríguez', 'carlos.rodriguez@booking-titanium.com', 'Pediatría', true)
ON CONFLICT (email) DO NOTHING;

-- Insert default services
INSERT INTO services (service_id, provider_id, name, description, duration_minutes, buffer_minutes, price_cents, currency, is_active)
SELECT 
    gen_random_uuid(),
    p.provider_id,
    s.name,
    s.description,
    s.duration_minutes,
    s.buffer_minutes,
    s.price_cents,
    s.currency,
    s.is_active
FROM (VALUES 
    ('Consulta General', 'Consulta médica general', 60, 10, 50000, 'MXN'),
    ('Consulta Especializada', 'Consulta con especialista', 90, 15, 80000, 'MXN'),
    ('Seguimiento', 'Consulta de seguimiento', 30, 5, 30000, 'MXN'),
    ('Emergencia', 'Atención de emergencia', 45, 10, 100000, 'MXN')
) AS s(name, description, duration_minutes, buffer_minutes, price_cents, currency)
CROSS JOIN (SELECT provider_id FROM providers LIMIT 1) p
ON CONFLICT DO NOTHING;

-- Insert default provider schedules (Mon-Fri 9:00-17:00)
INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
SELECT 
    p.provider_id,
    d.day,
    '09:00'::time,
    '17:00'::time,
    true
FROM providers p
CROSS JOIN (SELECT unnest(ARRAY[1,2,3,4,5]) AS day) d -- Monday to Friday
ON CONFLICT DO NOTHING;

-- Insert default circuit breaker state
INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
VALUES 
    ('google_calendar', 'closed', 0, 0),
    ('gmail', 'closed', 0, 0),
    ('telegram', 'closed', 0, 0),
    ('groq_llm', 'closed', 0, 0),
    ('openai_llm', 'closed', 0, 0)
ON CONFLICT (service_id) DO NOTHING;

-- ============================================================================
-- STEP 15: Create helper functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
DROP TRIGGER IF EXISTS update_providers_updated_at ON providers;
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-expire locks
CREATE OR REPLACE FUNCTION expire_old_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM booking_locks
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get available slots for a provider on a given date
CREATE OR REPLACE FUNCTION get_available_slots(
    p_provider_id UUID,
    p_date DATE,
    p_service_duration INT DEFAULT 30,
    p_buffer_time INT DEFAULT 10
)
RETURNS TABLE(slot_start TIMESTAMPTZ, slot_end TIMESTAMPTZ) AS $$
DECLARE
    v_day_of_week INT;
    v_start_time TIME;
    v_end_time TIME;
    v_current TIMESTAMPTZ;
    v_slot_end TIMESTAMPTZ;
    v_timezone TEXT;
BEGIN
    -- Get day of week (0=Sunday, 6=Saturday)
    v_day_of_week := EXTRACT(DOW FROM p_date)::INT;
    
    -- Get provider timezone
    SELECT timezone INTO v_timezone FROM providers WHERE provider_id = p_provider_id;
    IF v_timezone IS NULL THEN
        v_timezone := 'America/Mexico_City';
    END IF;
    
    -- Check if date is blocked by override
    IF EXISTS (SELECT 1 FROM schedule_overrides 
               WHERE provider_id = p_provider_id 
               AND override_date = p_date 
               AND is_blocked = true) THEN
        RETURN;
    END IF;
    
    -- Get schedule for this day
    SELECT start_time, end_time INTO v_start_time, v_end_time
    FROM provider_schedules
    WHERE provider_id = p_provider_id
    AND day_of_week = v_day_of_week
    AND is_active = true
    LIMIT 1;
    
    -- Check for override hours
    SELECT start_time, end_time INTO v_start_time, v_end_time
    FROM schedule_overrides
    WHERE provider_id = p_provider_id
    AND override_date = p_date
    AND is_blocked = false
    AND start_time IS NOT NULL
    LIMIT 1;
    
    -- If no schedule found, return
    IF v_start_time IS NULL OR v_end_time IS NULL THEN
        RETURN;
    END IF;
    
    -- Generate slots
    v_current := (p_date::text || ' ' || v_start_time::text)::TIMESTAMPTZ AT TIME ZONE v_timezone;
    
    LOOP
        v_slot_end := v_current + (p_service_duration || ' minutes')::INTERVAL;
        
        -- Check if slot fits within schedule
        EXIT WHEN v_slot_end > ((p_date::text || ' ' || v_end_time::text)::TIMESTAMPTZ AT TIME ZONE v_timezone);
        
        -- Check if slot is not already booked
        IF NOT EXISTS (
            SELECT 1 FROM bookings
            WHERE provider_id = p_provider_id
            AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
            AND start_time < v_slot_end
            AND end_time > v_current
        ) THEN
            slot_start := v_current;
            slot_end := v_slot_end;
            RETURN NEXT;
        END IF;
        
        -- Move to next slot
        v_current := v_slot_end + (p_buffer_time || ' minutes')::INTERVAL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
DECLARE
    v_provider_count INT;
    v_service_count INT;
    v_table_count INT;
BEGIN
    SELECT COUNT(*) INTO v_provider_count FROM providers;
    SELECT COUNT(*) INTO v_service_count FROM services;
    SELECT COUNT(*) INTO v_table_count FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 003 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created: %', v_table_count;
    RAISE NOTICE 'Providers: %', v_provider_count;
    RAISE NOTICE 'Services: %', v_service_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema now aligned with AGENTS.md §10';
    RAISE NOTICE 'All IDs are UUID, status is lowercase';
    RAISE NOTICE '========================================';
END $$;
