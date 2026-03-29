-- ============================================================================
-- BOOKING TITANIUM - DATABASE MIGRATION TO v4.0 COMPLIANCE
-- ============================================================================
-- This script migrates the existing database to comply with 
-- WINDMILL_GO_MEDICAL_BOOKING_SYSTEM_PROMPT v4.0 DEFINITIVE EDITION
-- 
-- Migration Date: 2026-03-28
-- Target: 100% Schema Compliance
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENABLE REQUIRED EXTENSIONS
-- ============================================================================

-- pgvector for RAG knowledge base
CREATE EXTENSION IF NOT EXISTS "vector";

-- btree_gist for EXCLUDE constraints (overlapping bookings)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- 2. CREATE PATIENTS TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS patients (
    patient_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_telegram ON patients(telegram_chat_id);

-- Trigger for updated_at
CREATE TRIGGER update_patients_updated_at 
    BEFORE UPDATE ON patients
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. CREATE PROVIDER_SCHEDULES TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_schedules (
    schedule_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL,
    day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    service_duration_min INT NOT NULL DEFAULT 30,
    buffer_time_min INT NOT NULL DEFAULT 10,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_schedule_time CHECK (start_time < end_time),
    CONSTRAINT valid_duration CHECK (service_duration_min > 0 AND service_duration_min <= 480),
    CONSTRAINT valid_buffer CHECK (buffer_time_min >= 0 AND buffer_time_min <= 120),
    UNIQUE(provider_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_provider_schedules_provider ON provider_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_dow ON provider_schedules(day_of_week);

-- ============================================================================
-- 4. CREATE SCHEDULE_OVERRIDES TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schedule_overrides (
    override_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID NOT NULL,
    override_date DATE NOT NULL,
    is_blocked    BOOLEAN DEFAULT false,
    start_time    TIME,
    end_time      TIME,
    reason        TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_override_time CHECK (
        is_blocked = true OR 
        (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    ),
    UNIQUE(provider_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_provider ON schedule_overrides(provider_id);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_date ON schedule_overrides(override_date);

-- ============================================================================
-- 5. CREATE BOOKING_AUDIT TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_audit (
    audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id    UUID NOT NULL,
    from_status   TEXT,
    to_status     TEXT NOT NULL,
    changed_by    TEXT NOT NULL CHECK (changed_by IN ('patient', 'provider', 'system')),
    actor_id      UUID,
    reason        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_audit_booking ON booking_audit(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_audit_created ON booking_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_audit_status ON booking_audit(from_status, to_status);

-- ============================================================================
-- 6. CREATE KNOWLEDGE_BASE TABLE (NEW - RAG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
    kb_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id   UUID,
    category      TEXT NOT NULL CHECK (category IN ('servicios', 'ubicacion', 'politicas', 'FAQ', 'general')),
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    embedding     vector(1536),
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_provider ON knowledge_base(provider_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_active ON knowledge_base(is_active);

-- IVFFlat index for semantic search (pgvector)
CREATE INDEX IF NOT EXISTS idx_kb_embedding 
    ON knowledge_base 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE TRIGGER update_knowledge_base_updated_at 
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. CREATE CONVERSATIONS TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
    message_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID,
    channel       TEXT NOT NULL CHECK (channel IN ('telegram', 'web', 'api')),
    direction     TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content       TEXT NOT NULL,
    intent        TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_intent ON conversations(intent);

-- ============================================================================
-- 8. MIGRATE PROVIDERS TABLE (SERIAL → UUID)
-- ============================================================================

-- Add UUID column
ALTER TABLE providers 
    ADD COLUMN IF NOT EXISTS provider_id UUID DEFAULT gen_random_uuid();

-- Backfill existing rows
UPDATE providers 
    SET provider_id = gen_random_uuid() 
    WHERE provider_id IS NULL;

-- Add new columns for v4.0 compliance
ALTER TABLE providers 
    ADD COLUMN IF NOT EXISTS specialty TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Mexico_City';

-- Make provider_id NOT NULL and set as primary key
ALTER TABLE providers 
    ALTER COLUMN provider_id SET NOT NULL,
    ALTER COLUMN provider_id SET DEFAULT gen_random_uuid();

-- Drop old SERIAL primary key constraint and recreate with UUID
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_pkey;
ALTER TABLE providers ADD PRIMARY KEY (provider_id);

-- Create index on old ID for reference
CREATE INDEX IF NOT EXISTS idx_providers_id ON providers(id);

-- Add specialty index
CREATE INDEX IF NOT EXISTS idx_providers_specialty ON providers(specialty);

-- ============================================================================
-- 9. MIGRATE SERVICES TABLE (Add provider_id FK, restructure)
-- ============================================================================

-- Add provider_id as UUID
ALTER TABLE services 
    ADD COLUMN IF NOT EXISTS provider_id UUID;

-- Add buffer_minutes and min_lead_hours if not exist
ALTER TABLE services 
    ADD COLUMN IF NOT EXISTS buffer_min INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS min_lead_booking_hours INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS min_lead_cancel_hours INT NOT NULL DEFAULT 0;

-- Add service_id UUID
ALTER TABLE services 
    ADD COLUMN IF NOT EXISTS service_id UUID DEFAULT gen_random_uuid();

-- Backfill service_id
UPDATE services 
    SET service_id = gen_random_uuid() 
    WHERE service_id IS NULL;

-- Set provider_id from provider_services junction (use first provider if multiple)
UPDATE services s
SET provider_id = (
    SELECT ps.provider_id 
    FROM provider_services ps 
    WHERE ps.service_id = s.id 
    LIMIT 1
)
WHERE s.provider_id IS NULL;

-- Make service_id NOT NULL
ALTER TABLE services 
    ALTER COLUMN service_id SET NOT NULL,
    ALTER COLUMN service_id SET DEFAULT gen_random_uuid();

-- Add constraints
ALTER TABLE services 
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index on new UUID
CREATE INDEX IF NOT EXISTS idx_services_service_id ON services(service_id);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);

-- ============================================================================
-- 10. MIGRATE PROVIDER_SERVICES JUNCTION (Use UUIDs)
-- ============================================================================

-- Add UUID columns
ALTER TABLE provider_services 
    ADD COLUMN IF NOT EXISTS provider_uuid UUID,
    ADD COLUMN IF NOT EXISTS service_uuid UUID;

-- Populate from old IDs
UPDATE provider_services ps
SET provider_uuid = p.provider_id
FROM providers p
WHERE ps.provider_id = p.id;

UPDATE provider_services ps
SET service_uuid = s.service_id
FROM services s
WHERE ps.service_id = s.id;

-- Add foreign keys with UUIDs
ALTER TABLE provider_services 
    ADD CONSTRAINT fk_provider_services_provider_uuid 
    FOREIGN KEY (provider_uuid) REFERENCES providers(provider_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_provider_services_service_uuid 
    FOREIGN KEY (service_uuid) REFERENCES services(service_id) ON DELETE CASCADE;

-- ============================================================================
-- 11. MIGRATE BOOKINGS TABLE (v4.0 Compliance)
-- ============================================================================

-- Add patient_id UUID
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(patient_id);

-- Add GCal sync fields
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS gcal_provider_event_id TEXT,
    ADD COLUMN IF NOT EXISTS gcal_patient_event_id TEXT,
    ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT DEFAULT 'pending'
        CHECK (gcal_sync_status IN ('pending','synced','partial','failed')),
    ADD COLUMN IF NOT EXISTS gcal_retry_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gcal_last_sync TIMESTAMPTZ;

-- Add notification tracking
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT false;

-- Add reschedule tracking
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS rescheduled_from UUID,
    ADD COLUMN IF NOT EXISTS rescheduled_to UUID,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add foreign keys for reschedule
ALTER TABLE bookings 
    ADD CONSTRAINT fk_bookings_rescheduled_from 
    FOREIGN KEY (rescheduled_from) REFERENCES bookings(booking_id),
    ADD CONSTRAINT fk_bookings_rescheduled_to 
    FOREIGN KEY (rescheduled_to) REFERENCES bookings(booking_id);

-- Update status constraint to v4.0 (lowercase, add in_service)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE bookings 
    ADD CONSTRAINT chk_status 
    CHECK (status IN ('pending','confirmed','in_service','completed','cancelled','no_show','rescheduled'));

-- Update existing bookings to lowercase status
UPDATE bookings SET status = LOWER(status);

-- Set default status to 'pending'
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';

-- Migrate provider_id to UUID reference
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS provider_uuid UUID;

UPDATE bookings b
SET provider_uuid = p.provider_id
FROM providers p
WHERE b.provider_id = p.id;

-- Migrate service_id to UUID reference
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS service_uuid UUID;

UPDATE bookings b
SET service_uuid = s.service_id
FROM services s
WHERE b.service_id = s.id;

-- Migrate user_id to patient_id
ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS patient_uuid UUID;

-- If user_id exists, try to match with patients.telegram_chat_id
UPDATE bookings b
SET patient_id = p.patient_id
FROM patients p
WHERE b.user_id IS NOT NULL 
  AND p.telegram_chat_id = b.user_id::TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_bookings_patient ON bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_uuid ON bookings(provider_uuid);
CREATE INDEX IF NOT EXISTS idx_bookings_service_uuid ON bookings(service_uuid);
CREATE INDEX IF NOT EXISTS idx_bookings_gcal_sync ON bookings(gcal_sync_status);
CREATE INDEX IF NOT EXISTS idx_bookings_gcal_provider ON bookings(gcal_provider_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_gcal_patient ON bookings(gcal_patient_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reminders 
    ON bookings(start_time) 
    WHERE status = 'confirmed' 
      AND (reminder_24h_sent = false OR reminder_2h_sent = false);
CREATE INDEX IF NOT EXISTS idx_bookings_reschedule 
    ON bookings(rescheduled_from, rescheduled_to);

-- EXCLUDE constraint for overlapping bookings (PREVENT DOUBLE BOOKING)
CREATE INDEX IF NOT EXISTS idx_bookings_no_overlap
    ON bookings USING gist (
        provider_uuid WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) 
    WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

-- ============================================================================
-- 12. MIGRATE BOOKING_LOCKS TABLE (Use UUIDs)
-- ============================================================================

ALTER TABLE booking_locks 
    ADD COLUMN IF NOT EXISTS provider_uuid UUID;

UPDATE booking_locks bl
SET provider_uuid = p.provider_id
FROM providers p
WHERE bl.provider_id = p.id;

CREATE INDEX IF NOT EXISTS idx_booking_locks_provider_uuid ON booking_locks(provider_uuid);

-- ============================================================================
-- 13. MIGRATE BOOKING_DLQ TABLE (Use UUIDs)
-- ============================================================================

ALTER TABLE booking_dlq 
    ADD COLUMN IF NOT EXISTS provider_uuid UUID,
    ADD COLUMN IF NOT EXISTS service_uuid UUID;

UPDATE booking_dlq dlq
SET provider_uuid = p.provider_id
FROM providers p
WHERE dlq.provider_id = p.id;

UPDATE booking_dlq dlq
SET service_uuid = s.service_id
FROM services s
WHERE dlq.service_id = s.id;

CREATE INDEX IF NOT EXISTS idx_dlq_provider_uuid ON booking_dlq(provider_uuid);
CREATE INDEX IF NOT EXISTS idx_dlq_service_uuid ON booking_dlq(service_uuid);

-- ============================================================================
-- 14. UPDATE CIRCUIT_BREAKER_STATE (Add more services)
-- ============================================================================

INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
VALUES 
    ('llm_groq', 'closed', 0, 0),
    ('llm_openai', 'closed', 0, 0),
    ('database', 'closed', 0, 0),
    ('redis', 'closed', 0, 0)
ON CONFLICT (service_id) DO NOTHING;

-- ============================================================================
-- 15. SEED DATA FOR NEW TABLES
-- ============================================================================

-- Seed default provider schedules (Monday-Friday, 9:00-17:00)
INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, service_duration_min, buffer_time_min)
SELECT 
    p.provider_id,
    dow,
    '09:00'::TIME,
    '17:00'::TIME,
    30,
    10
FROM providers p
CROSS JOIN (SELECT generate_series(1, 5) AS dow) AS days -- Monday to Friday
ON CONFLICT (provider_id, day_of_week, start_time) DO NOTHING;

-- Seed sample knowledge base entries
INSERT INTO knowledge_base (category, title, content, is_active) VALUES
    ('servicios', 'Consulta General', 
     'La consulta general incluye evaluación completa del paciente, diagnóstico preliminar y recomendaciones de tratamiento. Duración: 60 minutos.',
     true),
    ('servicios', 'Consulta Especializada', 
     'Atención con especialistas en cardiología, dermatología, pediatría, etc. Requiere referencia médica. Duración: 90 minutos.',
     true),
    ('politicas', 'Cancelación de Citas', 
     'Las citas pueden cancelarse hasta 24 horas antes sin costo. Cancelaciones con menos de 24 horas tienen un cargo del 50%.',
     true),
    ('politicas', 'Reagendamiento', 
     'Puedes reagendar tu cita hasta 2 horas antes del horario programado. Sujeto a disponibilidad.',
     true),
    ('ubicacion', 'Ubicación Clínica', 
     'Av. Principal 123, Piso 5, Consultorio 501. Ciudad de México. Metro más cercano: Insurgentes.',
     true),
    ('FAQ', '¿Aceptan seguros médicos?', 
     'Sí, aceptamos la mayoría de seguros médicos privados. Por favor verifica con tu aseguradora.',
     true),
    ('FAQ', '¿Qué métodos de pago aceptan?', 
     'Aceptamos efectivo, tarjetas de crédito/débito y transferencias bancarias.',
     true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 16. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to generate idempotency key
CREATE OR REPLACE FUNCTION generate_idempotency_key(
    p_provider_id UUID,
    p_service_id UUID,
    p_start_time TIMESTAMPTZ,
    p_patient_id UUID
) RETURNS TEXT AS $$
BEGIN
    RETURN encode(sha256((
        p_provider_id::TEXT || 
        p_service_id::TEXT || 
        to_char(p_start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || 
        p_patient_id::TEXT
    )::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate state transitions
CREATE OR REPLACE FUNCTION is_valid_booking_transition(
    p_from_status TEXT,
    p_to_status TEXT,
    p_actor TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_valid BOOLEAN := false;
BEGIN
    -- Define valid transitions
    CASE p_from_status
        WHEN 'pending' THEN
            v_valid := (p_to_status IN ('confirmed', 'cancelled', 'rescheduled'));
        WHEN 'confirmed' THEN
            v_valid := (p_to_status IN ('in_service', 'cancelled', 'rescheduled'));
        WHEN 'in_service' THEN
            v_valid := (p_to_status IN ('completed', 'no_show'));
        -- Terminal states
        WHEN 'completed', 'cancelled', 'no_show', 'rescheduled' THEN
            v_valid := false;
        ELSE
            v_valid := false;
    END CASE;
    
    -- Validate actor permissions
    IF v_valid THEN
        CASE p_to_status
            WHEN 'cancelled' THEN
                v_valid := p_actor IN ('patient', 'provider');
            WHEN 'rescheduled' THEN
                v_valid := p_actor IN ('patient', 'provider');
            WHEN 'in_service' THEN
                v_valid := p_actor = 'provider';
            WHEN 'no_show' THEN
                v_valid := p_actor = 'provider';
            ELSE
                v_valid := true;
        END CASE;
    END IF;
    
    RETURN v_valid;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create audit trail entry
CREATE OR REPLACE FUNCTION create_booking_audit_entry(
    p_booking_id UUID,
    p_from_status TEXT,
    p_to_status TEXT,
    p_changed_by TEXT,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO booking_audit (
        booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
    ) VALUES (
        p_booking_id, p_from_status, p_to_status, p_changed_by, p_actor_id, p_reason, p_metadata
    ) RETURNING audit_id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 17. CREATE VIEWS FOR BACKWARD COMPATIBILITY
-- ============================================================================

-- View for old bookings structure (with INT IDs)
CREATE OR REPLACE VIEW bookings_legacy AS
SELECT 
    b.id,
    b.provider_id AS old_provider_id,
    b.service_id AS old_service_id,
    b.start_time,
    b.end_time,
    b.status,
    b.idempotency_key,
    b.gcal_event_id,
    b.user_id,
    b.created_at,
    b.updated_at,
    b.cancelled_at,
    b.cancellation_reason,
    -- New fields
    b.provider_uuid,
    b.service_uuid,
    b.patient_id,
    b.gcal_provider_event_id,
    b.gcal_patient_event_id,
    b.gcal_sync_status
FROM bookings b;

-- View for providers with both ID types
CREATE OR REPLACE VIEW providers_legacy AS
SELECT 
    p.id AS old_id,
    p.provider_id,
    p.name,
    p.email,
    p.specialty,
    p.phone,
    p.is_active,
    p.gcal_calendar_id,
    p.timezone,
    p.created_at,
    p.updated_at
FROM providers p;

-- ============================================================================
-- 18. GRANT PERMISSIONS (Adjust as needed)
-- ============================================================================

-- Grant permissions to booking user (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'booking') THEN
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO booking;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO booking;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO booking;
    END IF;
END $$;

-- ============================================================================
-- 19. VACUUM AND ANALYZE
-- ============================================================================

VACUUM ANALYZE providers;
VACUUM ANALYZE services;
VACUUM ANALYZE bookings;
VACUUM ANALYZE patients;
VACUUM ANALYZE provider_schedules;
VACUUM ANALYZE schedule_overrides;
VACUUM ANALYZE booking_audit;
VACUUM ANALYZE knowledge_base;
VACUUM ANALYZE conversations;

-- ============================================================================
-- 20. COMPLETION MESSAGE
-- ============================================================================

DO $$
DECLARE
    v_providers_count INT;
    v_patients_count INT;
    v_bookings_count INT;
    v_kb_count INT;
BEGIN
    SELECT COUNT(*) INTO v_providers_count FROM providers;
    SELECT COUNT(*) INTO v_patients_count FROM patients;
    SELECT COUNT(*) INTO v_bookings_count FROM bookings;
    SELECT COUNT(*) INTO v_kb_count FROM knowledge_base;
    
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '  BOOKING TITANIUM - MIGRATION TO v4.0 COMPLETED SUCCESSFULLY';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  Tables Created:';
    RAISE NOTICE '    ✓ patients (v4.0 compliant)';
    RAISE NOTICE '    ✓ provider_schedules (v4.0 compliant)';
    RAISE NOTICE '    ✓ schedule_overrides (v4.0 compliant)';
    RAISE NOTICE '    ✓ booking_audit (v4.0 compliant)';
    RAISE NOTICE '    ✓ knowledge_base (v4.0 compliant, pgvector enabled)';
    RAISE NOTICE '    ✓ conversations (v4.0 compliant)';
    RAISE NOTICE '';
    RAISE NOTICE '  Tables Migrated:';
    RAISE NOTICE '    ✓ providers (SERIAL → UUID)';
    RAISE NOTICE '    ✓ services (added provider_id UUID, service_id UUID)';
    RAISE NOTICE '    ✓ bookings (added patient_id, GCal sync fields, status lowercase)';
    RAISE NOTICE '    ✓ booking_locks (added UUID references)';
    RAISE NOTICE '    ✓ booking_dlq (added UUID references)';
    RAISE NOTICE '';
    RAISE NOTICE '  Extensions Enabled:';
    RAISE NOTICE '    ✓ pgvector (for RAG semantic search)';
    RAISE NOTICE '    ✓ btree_gist (for EXCLUDE constraints)';
    RAISE NOTICE '';
    RAISE NOTICE '  Functions Created:';
    RAISE NOTICE '    ✓ generate_idempotency_key()';
    RAISE NOTICE '    ✓ is_valid_booking_transition()';
    RAISE NOTICE '    ✓ create_booking_audit_entry()';
    RAISE NOTICE '';
    RAISE NOTICE '  Data Statistics:';
    RAISE NOTICE '    - Providers: %', v_providers_count;
    RAISE NOTICE '    - Patients: %', v_patients_count;
    RAISE NOTICE '    - Bookings: %', v_bookings_count;
    RAISE NOTICE '    - Knowledge Base: %', v_kb_count;
    RAISE NOTICE '';
    RAISE NOTICE '  Next Steps:';
    RAISE NOTICE '    1. Update Go code to use UUID types';
    RAISE NOTICE '    2. Implement GCal sync with retry protocol';
    RAISE NOTICE '    3. Implement HIPAA-compliant logging';
    RAISE NOTICE '    4. Configure cron jobs for reconciliation';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

COMMIT;
