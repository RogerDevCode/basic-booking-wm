-- Database initialization script for Booking Titanium (PRODUCTION)
-- This script runs automatically when the PostgreSQL container starts for the first time

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- PROVIDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    gcal_calendar_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_email ON providers(email);
CREATE INDEX idx_providers_active ON providers(is_active);

-- ============================================================================
-- SERVICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_min INT NOT NULL DEFAULT 60,
    buffer_min INT NOT NULL DEFAULT 0,
    min_lead_booking_hours INT NOT NULL DEFAULT 0,
    min_lead_cancel_hours INT NOT NULL DEFAULT 0,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_name ON services(name);
CREATE INDEX idx_services_active ON services(is_active);

-- ============================================================================
-- PROVIDER_SERVICES JUNCTION TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS provider_services (
    provider_id INT REFERENCES providers(id) ON DELETE CASCADE,
    service_id INT REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (provider_id, service_id)
);

CREATE INDEX idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX idx_provider_services_service ON provider_services(service_id);

-- ============================================================================
-- BOOKINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id INT REFERENCES providers(id),
    service_id INT REFERENCES services(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'CONFIRMED',
    idempotency_key VARCHAR(255) UNIQUE,
    gcal_event_id VARCHAR(255),
    user_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    CONSTRAINT chk_status CHECK (status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'PENDING')),
    CONSTRAINT chk_times CHECK (end_time > start_time)
);

CREATE INDEX idx_bookings_provider_time ON bookings(provider_id, start_time);
CREATE INDEX idx_bookings_service_time ON bookings(service_id, start_time);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_idempotency ON bookings(idempotency_key);
CREATE INDEX idx_bookings_gcal ON bookings(gcal_event_id);

-- ============================================================================
-- CIRCUIT_BREAKER_STATE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    service_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'closed',
    failure_count INT NOT NULL DEFAULT 0,
    success_count INT NOT NULL DEFAULT 0,
    failure_threshold INT NOT NULL DEFAULT 5,
    success_threshold INT NOT NULL DEFAULT 3,
    timeout_seconds INT NOT NULL DEFAULT 300,
    opened_at TIMESTAMPTZ,
    half_open_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_cb_state CHECK (state IN ('closed', 'open', 'half-open'))
);

CREATE INDEX idx_cb_state ON circuit_breaker_state(state);

-- ============================================================================
-- BOOKING_LOCKS TABLE (Distributed Locks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_locks (
    lock_id SERIAL PRIMARY KEY,
    lock_key TEXT UNIQUE NOT NULL,
    owner_token TEXT NOT NULL,
    provider_id INT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_lock_expires CHECK (expires_at > acquired_at)
);

CREATE INDEX idx_booking_locks_key ON booking_locks(lock_key);
CREATE INDEX idx_booking_locks_expires ON booking_locks(expires_at);
CREATE INDEX idx_booking_locks_provider ON booking_locks(provider_id);

-- ============================================================================
-- DEAD_LETTER_QUEUE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS booking_dlq (
    dlq_id SERIAL PRIMARY KEY,
    booking_id INT,
    provider_id INT,
    service_id INT,
    failure_reason VARCHAR(100) NOT NULL,
    last_error_message TEXT NOT NULL,
    last_error_stack TEXT,
    original_payload JSONB NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    
    CONSTRAINT chk_dlq_status CHECK (status IN ('pending', 'resolved', 'discarded'))
);

CREATE INDEX idx_dlq_status ON booking_dlq(status);
CREATE INDEX idx_dlq_booking ON booking_dlq(booking_id);
CREATE INDEX idx_dlq_idempotency ON booking_dlq(idempotency_key);
CREATE INDEX idx_dlq_created ON booking_dlq(created_at);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default providers
INSERT INTO providers (name, email, is_active) VALUES
    ('Dr. Juan Pérez', 'juan.perez@booking-titanium.com', true),
    ('Dra. María González', 'maria.gonzalez@booking-titanium.com', true),
    ('Dr. Carlos Rodríguez', 'carlos.rodriguez@booking-titanium.com', true)
ON CONFLICT (email) DO NOTHING;

-- Insert default services
INSERT INTO services (name, duration_min, is_active) VALUES
    ('Consulta General', 60, true),
    ('Consulta Especializada', 90, true),
    ('Seguimiento', 30, true),
    ('Emergencia', 45, true)
ON CONFLICT DO NOTHING;

-- Link providers to services
INSERT INTO provider_services (provider_id, service_id)
SELECT p.id, s.id
FROM providers p
CROSS JOIN services s
ON CONFLICT DO NOTHING;

-- Insert default circuit breaker state
INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
VALUES 
    ('google_calendar', 'closed', 0, 0),
    ('gmail', 'closed', 0, 0),
    ('telegram', 'closed', 0, 0)
ON CONFLICT (service_id) DO NOTHING;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-expire locks function
CREATE OR REPLACE FUNCTION expire_old_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM booking_locks
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Booking Titanium database initialized successfully!';
END $$;
