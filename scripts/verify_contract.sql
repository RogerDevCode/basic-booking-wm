-- ============================================================================
-- Contract Verification: Code vs Production Database
-- Purpose: Find all mismatches between TypeScript code and production schema
-- Usage: psql "$DATABASE_URL" -f scripts/verify_contract.sql
-- ============================================================================

\echo '=============================================='
\echo '🔍 Contract Verification Report'
\echo '=============================================='
\echo ''

-- 1. Tables referenced in code but NOT in production
\echo '❌ Tables in CODE but MISSING in Production:'
\echo '   - booking_audit (referenced in booking_wizard, booking_cancel, booking_reschedule, noshow_trigger, booking_create)'
\echo '   - schedule_overrides (referenced in booking_create, provider_manage, scheduling-engine)'
\echo ''

-- 2. Check if bookings table has client_id (code expects it, production has user_id)
\echo '⚠️  Bookings Table Column Mismatch:'
SELECT '  Column "client_id": ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'client_id') THEN '✅ EXISTS' ELSE '❌ MISSING (code expects client_id, production has user_id)' END AS status;
SELECT '  Column "user_id": ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'user_id') THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status;
\echo ''

-- 3. Check clients table schema
\echo '📋 Clients Table (production):'
SELECT '  ' || column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END AS columns
FROM information_schema.columns WHERE table_name = 'clients' ORDER BY ordinal_position;
\echo ''

-- 4. Check providers table schema
\echo '📋 Providers Table (production):'
SELECT '  ' || column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END AS columns
FROM information_schema.columns WHERE table_name = 'providers' ORDER BY ordinal_position;
\echo ''

-- 5. Check services table schema
\echo '📋 Services Table (production):'
SELECT '  ' || column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END AS columns
FROM information_schema.columns WHERE table_name = 'services' ORDER BY ordinal_position;
\echo ''

-- 6. Check foreign keys
\echo '🔗 Foreign Key Relationships:'
SELECT '  ' || tc.table_name || '.' || kcu.column_name || ' → ' || ccu.table_name || '.' || ccu.column_name AS fk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;
\echo ''

-- 7. Check for orphaned FK references (tables referencing non-existent tables)
\echo '⚠️  Potentially Broken Foreign Keys:'
SELECT '  ' || tc.table_name || '.' || kcu.column_name || ' → ' || ccu.table_name || '.' || ccu.column_name AS orphaned_fk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = ccu.table_name AND schemaname = 'public')
ORDER BY tc.table_name;
\echo ''

-- 8. Summary of ALL tables
\echo '📊 All Production Tables (21):'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
\echo ''

\echo '=============================================='
\echo '🔧 REQUIRED ACTIONS'
\echo '=============================================='
\echo '1. Create booking_audit table (used by 5 scripts)'
\echo '2. Create schedule_overrides table (used by 3 scripts)'
\echo '3. Decide: bookings.client_id vs bookings.user_id — code uses client_id, DB has user_id'
\echo '=============================================='
