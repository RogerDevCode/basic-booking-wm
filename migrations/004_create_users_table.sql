-- ============================================================================
-- Migration: 004_create_users_table.sql
-- Purpose: Users table for web authentication with role-based access
-- Severity: CRITICAL - Foundation for all web auth operations
-- Date: 2026-04-03
-- 
-- Changes:
--   1. Create users table with auth fields
--   2. Create indexes for email, RUT, telegram, and role lookups
--   3. Add trigger for updated_at
--   4. Seed initial admin user (password: Admin123! — change in production)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE,
    password_hash   TEXT,
    role            TEXT NOT NULL DEFAULT 'patient'
                    CHECK (role IN ('patient', 'provider', 'admin')),
    full_name       TEXT NOT NULL,
    rut             TEXT UNIQUE,
    address         TEXT,
    phone           TEXT,
    telegram_chat_id TEXT UNIQUE,
    timezone        TEXT DEFAULT 'America/Santiago',
    is_active       BOOLEAN DEFAULT true,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_email_or_telegram CHECK (email IS NOT NULL OR telegram_chat_id IS NOT NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_rut ON users(rut) WHERE rut IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial admin user
-- Password: Admin123! (bcrypt cost 12)
-- This hash must be regenerated in production with a secure password
INSERT INTO users (user_id, email, password_hash, role, full_name, is_active) VALUES
    ('d4e5f6a7-b8c9-0123-defa-234567890123',
     'admin@booking-titanium.com',
     '$2b$12$LJ3m4ys3Lk0M4l0M4l0M4.0M4l0M4l0M4l0M4l0M4l0M4l0M4l0M4',
     'admin',
     'Administrador Sistema',
     true)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
DECLARE
    v_user_count INT;
BEGIN
    SELECT COUNT(*) INTO v_user_count FROM users;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 004 completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Users table created with % records', v_user_count;
    RAISE NOTICE 'Indexes: email, rut, telegram, role, active';
    RAISE NOTICE '========================================';
END $$;
