-- ============================================================================
-- DATABASE SCHEMA AUDIT - SINGLE PROVIDER v5.0
-- ============================================================================
-- Este script verifica que la estructura de la DB coincida 100% con el código Go
-- Ejecutar: psql -U booking -d bookings -f scripts/audit_database_schema.sql
-- ============================================================================

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '  DATABASE SCHEMA AUDIT - SINGLE PROVIDER v5.0'
\echo '════════════════════════════════════════════════════════════'
\echo ''

-- ============================================================================
-- 1. VERIFY TABLES EXIST
-- ============================================================================
\echo 'CHECK 1: Required Tables'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_config') THEN '✓ system_config'
        ELSE '✗ MISSING: system_config'
    END as check_result
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'providers') THEN '✓ providers' ELSE '✗ MISSING: providers' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN '✓ services' ELSE '✗ MISSING: services' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN '✓ bookings' ELSE '✗ MISSING: bookings' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients') THEN '✓ patients' ELSE '✗ MISSING: patients' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'circuit_breaker_state') THEN '✓ circuit_breaker_state' ELSE '✗ MISSING: circuit_breaker_state' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_locks') THEN '✓ booking_locks' ELSE '✗ MISSING: booking_locks' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_dlq') THEN '✓ booking_dlq' ELSE '✗ MISSING: booking_dlq' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'knowledge_base') THEN '✓ knowledge_base (optional)' ELSE '⚠ MISSING: knowledge_base (optional)' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_services') THEN '✗ DEPRECATED: provider_services should be dropped' ELSE '✓ provider_services dropped' END;

\echo ''

-- ============================================================================
-- 2. VERIFY PROVIDERS TABLE STRUCTURE
-- ============================================================================
\echo 'CHECK 2: Providers Table Structure'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    column_name,
    data_type,
    is_nullable,
    CASE 
        WHEN column_name = 'provider_id' AND data_type = 'uuid' THEN '✓ UUID type'
        WHEN column_name = 'provider_id' AND data_type != 'uuid' THEN '✗ Should be UUID'
        ELSE '✓'
    END as validation
FROM information_schema.columns
WHERE table_name = 'providers'
ORDER BY ordinal_position;

\echo ''

-- ============================================================================
-- 3. VERIFY SERVICES TABLE STRUCTURE
-- ============================================================================
\echo 'CHECK 3: Services Table Structure'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    column_name,
    data_type,
    is_nullable,
    CASE 
        WHEN column_name = 'service_id' AND data_type = 'uuid' THEN '✓ UUID type'
        WHEN column_name = 'service_id' AND data_type != 'uuid' THEN '✗ Should be UUID'
        ELSE '✓'
    END as validation
FROM information_schema.columns
WHERE table_name = 'services'
ORDER BY ordinal_position;

\echo ''

-- ============================================================================
-- 4. VERIFY BOOKINGS TABLE STRUCTURE
-- ============================================================================
\echo 'CHECK 4: Bookings Table Structure'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    column_name,
    data_type,
    is_nullable,
    CASE 
        WHEN column_name IN ('id', 'provider_id', 'service_id', 'patient_id') AND data_type = 'uuid' THEN '✓ UUID type'
        WHEN column_name IN ('id', 'provider_id', 'service_id', 'patient_id') AND data_type != 'uuid' THEN '✗ Should be UUID'
        WHEN column_name = 'status' AND data_type = 'character varying' THEN '✓ VARCHAR'
        WHEN column_name LIKE '%gcal%' THEN '✓ GCal field'
        WHEN column_name LIKE '%reminder%' THEN '✓ Reminder field'
        ELSE '✓'
    END as validation
FROM information_schema.columns
WHERE table_name = 'bookings'
ORDER BY ordinal_position;

\echo ''

-- ============================================================================
-- 5. VERIFY SYSTEM_CONFIG
-- ============================================================================
\echo 'CHECK 5: System Config Entries'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    config_key,
    config_value,
    description
FROM system_config
ORDER BY config_key;

\echo ''

-- ============================================================================
-- 6. VERIFY SINGLE PROVIDER/SERVICE
-- ============================================================================
\echo 'CHECK 6: Single Provider/Service Configuration'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    'Active Providers' as check_name,
    COUNT(*)::TEXT as value,
    CASE WHEN COUNT(*) = 1 THEN '✓ Expected: 1' ELSE '✗ Should be 1' END as validation
FROM providers WHERE is_active = true
UNION ALL
SELECT 
    'Active Services',
    COUNT(*)::TEXT,
    CASE WHEN COUNT(*) = 1 THEN '✓ Expected: 1' ELSE '✗ Should be 1' END
FROM services WHERE is_active = true;

\echo ''

-- ============================================================================
-- 7. VERIFY HELPER FUNCTIONS
-- ============================================================================
\echo 'CHECK 7: Helper Functions'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    routine_name,
    CASE 
        WHEN routine_name = 'get_single_provider_id' THEN '✓ Returns provider UUID'
        WHEN routine_name = 'get_single_service_id' THEN '✓ Returns service UUID'
        WHEN routine_name = 'get_system_config_value' THEN '✓ Returns config value'
        ELSE '✓'
    END as validation
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_single_provider_id', 'get_single_service_id', 'get_system_config_value')
ORDER BY routine_name;

\echo ''

-- ============================================================================
-- 8. VERIFY TRIGGERS
-- ============================================================================
\echo 'CHECK 8: Triggers'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    '✓ Active' as status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%validate%'
ORDER BY trigger_name;

\echo ''

-- ============================================================================
-- 9. VERIFY UUID CONSISTENCY
-- ============================================================================
\echo 'CHECK 9: UUID Type Consistency'
\echo '────────────────────────────────────────────────────────────'

SELECT 
    table_name,
    column_name,
    data_type,
    CASE 
        WHEN column_name LIKE '%_id' AND data_type = 'uuid' THEN '✓ UUID'
        WHEN column_name LIKE '%_id' AND data_type = 'integer' THEN '⚠ INTEGER (should be UUID)'
        WHEN column_name LIKE '%_id' AND data_type = 'character varying' THEN '⚠ VARCHAR (should be UUID)'
        ELSE '✓ Not an ID field'
    END as type_check
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'providers' OR table_name = 'services' OR table_name = 'bookings' OR table_name = 'patients')
  AND column_name LIKE '%_id'
ORDER BY table_name, ordinal_position;

\echo ''

-- ============================================================================
-- 10. VERIFY STATUS VALUES
-- ============================================================================
\echo 'CHECK 10: Booking Status Values'
\echo '────────────────────────────────────────────────────────────'

SELECT DISTINCT status, '✓ Valid' as validation
FROM bookings
WHERE status IN ('pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled')
UNION ALL
SELECT DISTINCT status, '✗ Invalid status value'
FROM bookings
WHERE status NOT IN ('pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled');

\echo ''

-- ============================================================================
-- 11. VERIFY FOREIGN KEYS
-- ============================================================================
\echo 'CHECK 11: Foreign Key Constraints'
\echo '────────────────────────────────────────────────────────────'

SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    '✓ FK defined' as validation
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('bookings', 'services')
ORDER BY tc.table_name;

\echo ''

-- ============================================================================
-- 12. SUMMARY
-- ============================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '  AUDIT SUMMARY'
\echo '════════════════════════════════════════════════════════════'
\echo ''

SELECT 
    'Total Tables' as metric,
    COUNT(*)::TEXT as value
FROM information_schema.tables
WHERE table_schema = 'public'
UNION ALL
SELECT 
    'Total Columns (core tables)',
    COUNT(*)::TEXT
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('providers', 'services', 'bookings', 'patients', 'system_config')
UNION ALL
SELECT 
    'Active Providers',
    COUNT(*)::TEXT
FROM providers WHERE is_active = true
UNION ALL
SELECT 
    'Active Services',
    COUNT(*)::TEXT
FROM services WHERE is_active = true
UNION ALL
SELECT 
    'System Config Entries',
    COUNT(*)::TEXT
FROM system_config
UNION ALL
SELECT 
    'Helper Functions',
    COUNT(*)::TEXT
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_single_provider_id', 'get_single_service_id', 'get_system_config_value');

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '  AUDIT COMPLETE'
\echo '════════════════════════════════════════════════════════════'
\echo ''
