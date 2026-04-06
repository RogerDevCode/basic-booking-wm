-- ============================================================================
-- ORPHAN COLUMN DETECTION
-- Finds columns in production that are NOT referenced in any TypeScript code
-- This identifies dead columns from old schema versions
-- ============================================================================

-- Manual verification needed — this script lists ALL columns with their usage status
-- The developer should grep the codebase for each column to confirm orphan status

\echo '=============================================='
\echo '🔍 Orphan Column Detection Report'
\echo '=============================================='
\echo ''

-- For each table, list all columns. Developer should verify usage in code.

\echo '📋 audit_logs columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'audit_logs' ORDER BY ordinal_position;

\echo ''
\echo '📋 booking_audit columns (NEW):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'booking_audit' ORDER BY ordinal_position;

\echo ''
\echo '📋 booking_dlq columns (CHECK for orphans):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'booking_dlq' ORDER BY ordinal_position;

\echo ''
\echo '📋 booking_intents columns (CHECK for orphans):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'booking_intents' ORDER BY ordinal_position;

\echo ''
\echo '📋 booking_locks columns (CHECK for orphans):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'booking_locks' ORDER BY ordinal_position;

\echo ''
\echo '📋 bookings columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'bookings' ORDER BY ordinal_position;

\echo ''
\echo '📋 circuit_breaker_state columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'circuit_breaker_state' ORDER BY ordinal_position;

\echo ''
\echo '📋 clients columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'clients' ORDER BY ordinal_position;

\echo ''
\echo '📋 conversations columns (NEW):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'conversations' ORDER BY ordinal_position;

\echo ''
\echo '📋 knowledge_base columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'knowledge_base' ORDER BY ordinal_position;

\echo ''
\echo '📋 provider_exceptions columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'provider_exceptions' ORDER BY ordinal_position;

\echo ''
\echo '📋 provider_schedules columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'provider_schedules' ORDER BY ordinal_position;

\echo ''
\echo '📋 provider_services columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'provider_services' ORDER BY ordinal_position;

\echo ''
\echo '📋 providers columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'providers' ORDER BY ordinal_position;

\echo ''
\echo '📋 rag_documents columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'rag_documents' ORDER BY ordinal_position;

\echo ''
\echo '📋 schedule_overrides columns (NEW):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'schedule_overrides' ORDER BY ordinal_position;

\echo ''
\echo '📋 service_notes columns (NEW):'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'service_notes' ORDER BY ordinal_position;

\echo ''
\echo '📋 services columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'services' ORDER BY ordinal_position;

\echo ''
\echo '📋 system_config columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'system_config' ORDER BY ordinal_position;

\echo ''
\echo '📋 system_logs columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'system_logs' ORDER BY ordinal_position;

\echo ''
\echo '📋 timezones columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'timezones' ORDER BY ordinal_position;

\echo ''
\echo '📋 users columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;

\echo ''
\echo '📋 waitlist columns:'
SELECT '  ' || column_name || ' (' || data_type || ')' AS columns
FROM information_schema.columns WHERE table_name = 'waitlist' ORDER BY ordinal_position;

\echo ''
\echo '=============================================='
\echo '🔍 TYPE MISMATCH DETECTION'
\echo '=============================================='
\echo ''
\echo '⚠️  booking_dlq.booking_id (integer) vs bookings.booking_id (uuid)'
\echo '⚠️  booking_dlq.provider_id (integer) vs providers.id (uuid)'
\echo '⚠️  booking_dlq.service_id (integer) vs services.id (uuid)'
\echo '⚠️  booking_intents.booking_id (integer) vs bookings.booking_id (uuid)'
\echo '⚠️  booking_intents.provider_id (integer) vs providers.id (uuid)'
\echo '⚠️  booking_intents.service_id (integer) vs services.id (uuid)'
\echo '⚠️  booking_locks.provider_id (integer) vs providers.id (uuid)'
\echo ''
