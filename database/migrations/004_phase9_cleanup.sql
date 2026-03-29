-- ============================================================================
-- SINGLE PROVIDER MIGRATION - PHASE 9 CLEANUP
-- ============================================================================
-- This script handles:
-- 1. DLQ purge (old messages with invalid provider_ids)
-- 2. Idempotency key update for single-provider
-- 3. GCal calendar ID standardization
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PURGE DEAD LETTER QUEUE (old entries with invalid provider_ids)
-- ============================================================================

-- Archive old DLQ entries before purging
CREATE TABLE IF NOT EXISTS booking_dlq_archived AS
SELECT *, NOW() as archived_at
FROM booking_dlq
WHERE created_at < NOW() - INTERVAL '30 days';

-- Purge old DLQ entries (older than 30 days)
DELETE FROM booking_dlq
WHERE created_at < NOW() - INTERVAL '30 days';

-- Update remaining DLQ entries to use single provider/service
UPDATE booking_dlq
SET 
    provider_id = (SELECT get_single_provider_id()),
    service_id = (SELECT get_single_service_id())
WHERE provider_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM providers WHERE provider_id = booking_dlq.provider_id::uuid);

-- ============================================================================
-- 2. UPDATE IDEMPOTENCY KEYS FOR SINGLE-PROVIDER
-- ============================================================================

-- Note: Idempotency keys are generated at runtime, not stored permanently
-- But we should ensure any cached keys use the new format
-- This is handled in Go code: utils.GenerateIdempotencyKeySingle()

-- ============================================================================
-- 3. STANDARDIZE GCAL CALENDAR ID
-- ============================================================================

-- Ensure single provider has a GCal calendar ID set
UPDATE providers
SET 
    gcal_calendar_id = COALESCE(gcal_calendar_id, 'primary'),
    updated_at = NOW()
WHERE provider_id = (SELECT get_single_provider_id());

-- Store GCal calendar ID in system_config for easy access
INSERT INTO system_config (config_key, config_value, description)
VALUES (
    'gcal_calendar_id',
    (SELECT gcal_calendar_id FROM providers WHERE provider_id = (SELECT get_single_provider_id())),
    'Google Calendar ID for the single provider'
)
ON CONFLICT (config_key) DO UPDATE
SET 
    config_value = EXCLUDED.config_value,
    updated_at = NOW();

-- ============================================================================
-- 4. CLEANUP ORPHANED DATA
-- ============================================================================

-- Deactivate any providers other than the single one
UPDATE providers
SET is_active = false, updated_at = NOW()
WHERE provider_id != (SELECT get_single_provider_id())
  AND is_active = true;

-- Deactivate any services other than the single one
UPDATE services
SET is_active = false, updated_at = NOW()
WHERE service_id != (SELECT get_single_service_id())
  AND is_active = true;

-- ============================================================================
-- 5. UPDATE BOOKING TEMPLATES (remove provider_name references)
-- ============================================================================

-- Add a config for static provider name (used in notifications)
INSERT INTO system_config (config_key, config_value, description)
VALUES (
    'provider_name',
    (SELECT name FROM providers WHERE provider_id = (SELECT get_single_provider_id())),
    'Static provider name for notifications'
)
ON CONFLICT (config_key) DO UPDATE
SET 
    config_value = EXCLUDED.config_value,
    updated_at = NOW();

-- ============================================================================
-- 6. CREATE CLEANUP VERIFICATION VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_single_provider_verification AS
SELECT 
    'system_config_count' as check_name,
    COUNT(*)::TEXT as value
FROM system_config
UNION ALL
SELECT 
    'active_providers',
    (SELECT COUNT(*) FROM providers WHERE is_active = true)::TEXT
UNION ALL
SELECT 
    'active_services',
    (SELECT COUNT(*) FROM services WHERE is_active = true)::TEXT
UNION ALL
SELECT 
    'dlq_entries',
    (SELECT COUNT(*) FROM booking_dlq)::TEXT
UNION ALL
SELECT 
    'gcal_calendar_configured',
    (SELECT CASE WHEN config_value IS NOT NULL THEN 'YES' ELSE 'NO' END 
     FROM system_config WHERE config_key = 'gcal_calendar_id');

-- ============================================================================
-- 7. LOG COMPLETION
-- ============================================================================

DO $$
DECLARE
    v_provider_name TEXT;
    v_service_name TEXT;
    v_gcal_id TEXT;
BEGIN
    SELECT config_value INTO v_provider_name
    FROM system_config WHERE config_key = 'provider_name';
    
    SELECT config_value INTO v_gcal_id
    FROM system_config WHERE config_key = 'gcal_calendar_id';
    
    SELECT name INTO v_service_name
    FROM services WHERE service_id = (SELECT get_single_service_id());
    
    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '  PHASE 9 CLEANUP COMPLETED';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  Provider: %', v_provider_name;
    RAISE NOTICE '  Service:  %', v_service_name;
    RAISE NOTICE '  GCal ID:  %', COALESCE(v_gcal_id, 'NOT CONFIGURED');
    RAISE NOTICE '';
    RAISE NOTICE '  DLQ entries purged: Old entries archived and removed';
    RAISE NOTICE '  Orphaned data cleaned: Inactive providers/services deactivated';
    RAISE NOTICE '';
    RAISE NOTICE '  Next Steps:';
    RAISE NOTICE '  1. Run: SELECT * FROM v_single_provider_verification;';
    RAISE NOTICE '  2. Update Go code to remove get_providers/get_services endpoints';
    RAISE NOTICE '  3. Update notification templates to use static provider name';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

COMMIT;
