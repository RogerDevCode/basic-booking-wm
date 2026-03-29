-- ============================================================================
-- BOOKING TITANIUM v5.0 - SINGLE PROVIDER/SERVICE MIGRATION
-- ============================================================================
-- This script migrates the database from multi-provider/multi-service to
-- single-provider/single-service configuration (Agenda de Recurso Único)
-- 
-- Migration Date: 2026-03-28
-- Version: 5.0.0
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE SYSTEM_CONFIG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_config IS 'Configuration for single-provider/single-service system';
COMMENT ON COLUMN system_config.config_key IS 'Configuration key (e.g., single_provider_id)';
COMMENT ON COLUMN system_config.config_value IS 'Configuration value (UUID or integer)';
COMMENT ON COLUMN system_config.description IS 'Human-readable description of the config';

-- ============================================================================
-- 2. INSERT SINGLE PROVIDER/SERVICE CONFIGURATION
-- ============================================================================

-- IMPORTANT: Replace these UUIDs with actual IDs from your database
-- Get the UUID of your single provider
DO $$
DECLARE
    v_provider_id UUID;
    v_service_id UUID;
BEGIN
    -- Get first active provider (or create one if none exists)
    SELECT provider_id INTO v_provider_id
    FROM providers
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- If no provider exists, create one
    IF v_provider_id IS NULL THEN
        INSERT INTO providers (provider_id, name, email, specialty, is_active)
        VALUES (gen_random_uuid(), 'Dr. Default Provider', 'default@clinic.com', 'Medicina General', true)
        RETURNING provider_id INTO v_provider_id;
        
        RAISE NOTICE 'Created default provider with ID: %', v_provider_id;
    END IF;
    
    -- Get first active service (or create one if none exists)
    SELECT service_id INTO v_service_id
    FROM services
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- If no service exists, create one
    IF v_service_id IS NULL THEN
        INSERT INTO services (service_id, name, duration_min, buffer_min, is_active)
        VALUES (gen_random_uuid(), 'Consulta General', 60, 10, true)
        RETURNING service_id INTO v_service_id;
        
        RAISE NOTICE 'Created default service with ID: %', v_service_id;
    END IF;
    
    -- Insert configuration
    INSERT INTO system_config (config_key, config_value, description) VALUES
        ('single_provider_id', v_provider_id::TEXT, 'UUID del único proveedor del sistema'),
        ('single_service_id', v_service_id::TEXT, 'UUID del único servicio ofrecido'),
        ('service_duration_min', '60', 'Duración estándar del servicio en minutos'),
        ('service_buffer_min', '10', 'Buffer entre citas en minutos'),
        ('booking_max_advance_days', '90', 'Días máximos de anticipación para reservas'),
        ('booking_min_advance_hours', '2', 'Horas mínimas de anticipación para reservas')
    ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value,
        updated_at = NOW();
    
    RAISE NOTICE 'System configuration inserted successfully';
    RAISE NOTICE 'Single Provider ID: %', v_provider_id;
    RAISE NOTICE 'Single Service ID: %', v_service_id;
END $$;

-- ============================================================================
-- 3. DROP PROVIDER_SERVICES JUNCTION TABLE (NO LONGER NEEDED)
-- ============================================================================

-- Drop junction table if it exists
DROP TABLE IF EXISTS provider_services;

COMMENT ON TABLE provider_services IS 'DROPPED - No longer needed in single-provider system';

-- ============================================================================
-- 4. CREATE VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_system_config()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate provider_id exists
    IF NEW.config_key = 'single_provider_id' THEN
        IF NOT EXISTS (SELECT 1 FROM providers WHERE provider_id = NEW.config_value) THEN
            RAISE EXCEPTION 'Provider ID % does not exist', NEW.config_value;
        END IF;
    END IF;
    
    -- Validate service_id exists
    IF NEW.config_key = 'single_service_id' THEN
        IF NOT EXISTS (SELECT 1 FROM services WHERE service_id = NEW.config_value) THEN
            RAISE EXCEPTION 'Service ID % does not exist', NEW.config_value;
        END IF;
    END IF;
    
    -- Validate duration is positive
    IF NEW.config_key = 'service_duration_min' THEN
        IF NEW.config_value::INT <= 0 THEN
            RAISE EXCEPTION 'Service duration must be positive';
        END IF;
    END IF;
    
    -- Validate buffer is non-negative
    IF NEW.config_key = 'service_buffer_min' THEN
        IF NEW.config_value::INT < 0 THEN
            RAISE EXCEPTION 'Service buffer cannot be negative';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_system_config() IS 'Validates system_config values before insert/update';

-- ============================================================================
-- 5. CREATE TRIGGER FOR VALIDATION
-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_system_config ON system_config;

CREATE TRIGGER trg_validate_system_config
    BEFORE INSERT OR UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION validate_system_config();

COMMENT ON TRIGGER trg_validate_system_config ON system_config IS 'Validates config changes';

-- ============================================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
CREATE INDEX IF NOT EXISTS idx_system_config_updated_at ON system_config(updated_at DESC);

-- ============================================================================
-- 7. CLEANUP DUPLICATE PROVIDERS AND SERVICES (OPTIONAL)
-- ============================================================================

-- This section is OPTIONAL - uncomment if you want to automatically
-- deactivate all providers/services except the configured single one

-- Uncomment to activate:
/*
DO $$
DECLARE
    v_provider_id UUID;
    v_service_id UUID;
BEGIN
    -- Get configured single provider
    SELECT config_value::UUID INTO v_provider_id
    FROM system_config
    WHERE config_key = 'single_provider_id';
    
    -- Get configured single service
    SELECT config_value::UUID INTO v_service_id
    FROM system_config
    WHERE config_key = 'single_service_id';
    
    -- Deactivate all other providers
    UPDATE providers
    SET is_active = false, updated_at = NOW()
    WHERE provider_id != v_provider_id
      AND is_active = true;
    
    -- Deactivate all other services
    UPDATE services
    SET is_active = false, updated_at = NOW()
    WHERE service_id != v_service_id
      AND is_active = true;
    
    RAISE NOTICE 'Deactivated duplicate providers and services';
END $$;
*/

-- ============================================================================
-- 8. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get single provider ID
CREATE OR REPLACE FUNCTION get_single_provider_id()
RETURNS UUID AS $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT config_value::UUID INTO v_provider_id
    FROM system_config
    WHERE config_key = 'single_provider_id';
    
    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Single provider ID not configured in system_config';
    END IF;
    
    RETURN v_provider_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get single service ID
CREATE OR REPLACE FUNCTION get_single_service_id()
RETURNS UUID AS $$
DECLARE
    v_service_id UUID;
BEGIN
    SELECT config_value::UUID INTO v_service_id
    FROM system_config
    WHERE config_key = 'single_service_id';
    
    IF v_service_id IS NULL THEN
        RAISE EXCEPTION 'Single service ID not configured in system_config';
    END IF;
    
    RETURN v_service_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get config value
CREATE OR REPLACE FUNCTION get_system_config_value(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
    v_value TEXT;
BEGIN
    SELECT config_value INTO v_value
    FROM system_config
    WHERE config_key = p_key;
    
    IF v_value IS NULL THEN
        RAISE EXCEPTION 'Config key % not found', p_key;
    END IF;
    
    RETURN v_value;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 9. CREATE CONFIG REFRESH FUNCTION (for cache invalidation)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_system_config()
RETURNS VOID AS $$
BEGIN
    -- This function can be called to signal cache refresh
    -- In Go, you would listen for NOTIFY events
    PERFORM pg_notify('system_config_refresh', 'config_updated');
END;
$$ LANGUAGE plpgsql;

-- Create trigger to notify on config changes
CREATE OR REPLACE FUNCTION notify_config_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('system_config_refresh', 
        json_build_object(
            'operation', TG_OP,
            'key', NEW.config_key,
            'value', NEW.config_value,
            'timestamp', NOW()
        )::TEXT);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_config_change ON system_config;

CREATE TRIGGER trg_notify_config_change
    AFTER INSERT OR UPDATE OR DELETE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION notify_config_change();

-- ============================================================================
-- 10. VERIFICATION QUERIES
-- ============================================================================

-- Display configuration
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '  SYSTEM CONFIGURATION (Single Provider/Service)';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    
    FOR r IN SELECT config_key, config_value, description FROM system_config ORDER BY config_key
    LOOP
        RAISE NOTICE '  %', r.config_key;
        RAISE NOTICE '    Value: %', r.config_value;
        RAISE NOTICE '    Desc:  %', r.description;
        RAISE NOTICE '';
    END LOOP;
    
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Migration completed successfully!';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- 11. COMMIT
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION (Run separately)
-- ============================================================================

-- Verify configuration
-- SELECT * FROM system_config;

-- Test helper functions
-- SELECT get_single_provider_id();
-- SELECT get_single_service_id();
-- SELECT get_system_config_value('service_duration_min');

-- Test validation (should fail)
-- INSERT INTO system_config (config_key, config_value) VALUES ('single_provider_id', 'invalid-uuid');
