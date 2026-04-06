-- ============================================================================
-- Migration Verification Query
-- Run against production database to check migration status
-- Usage: psql "$DATABASE_URL" -f scripts/verify_migrations.sql
-- ============================================================================

\echo '=============================================='
\echo '🔍 Migration Verification Report'
\echo '=============================================='
\echo ''

-- Migration 001: Add Exclude Constraint
\echo '📦 Migration 001: Add Exclude Constraint'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN '✅' ELSE '❌' END || ' Extension btree_gist' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'bookings') THEN '✅' ELSE '❌' END || ' Table bookings exists' AS status;
\echo ''

-- Migration 002: Optimize Indexes
\echo '📦 Migration 002: Optimize Indexes'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_provider_time') THEN '✅' ELSE '❌' END || ' Index idx_bookings_provider_time' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_booking_intents_status') THEN '✅' ELSE '❌' END || ' Index idx_booking_intents_status' AS status;
\echo ''

-- Migration 003: Complete Schema Overhaul
\echo '📦 Migration 003: Complete Schema Overhaul'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'providers') THEN '✅' ELSE '❌' END || ' Table providers' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'services') THEN '✅' ELSE '❌' END || ' Table services' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'bookings') THEN '✅' ELSE '❌' END || ' Table bookings' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'provider_schedules') THEN '✅' ELSE '❌' END || ' Table provider_schedules' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'patients') THEN '✅' ELSE '❌' END || ' Table patients' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'specialty') THEN '✅' ELSE '❌' END || ' Column providers.specialty' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'phone') THEN '✅' ELSE '❌' END || ' Column providers.phone' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'telegram_chat_id') THEN '✅' ELSE '❌' END || ' Column providers.telegram_chat_id' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'timezone') THEN '✅' ELSE '❌' END || ' Column providers.timezone' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'created_at') THEN '✅' ELSE '❌' END || ' Column providers.created_at' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'updated_at') THEN '✅' ELSE '❌' END || ' Column providers.updated_at' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'providers' AND column_name = 'provider_id') THEN '✅' ELSE '❌' END || ' Column providers.provider_id' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'knowledge_base') THEN '✅' ELSE '❌' END || ' Table knowledge_base' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'conversations') THEN '✅' ELSE '❌' END || ' Table conversations' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'booking_intents') THEN '✅' ELSE '❌' END || ' Table booking_intents' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'booking_locks') THEN '✅' ELSE '❌' END || ' Table booking_locks' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'booking_dlq') THEN '✅' ELSE '❌' END || ' Table booking_dlq' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'circuit_breaker_state') THEN '✅' ELSE '❌' END || ' Table circuit_breaker_state' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'audit_logs') THEN '✅' ELSE '❌' END || ' Table audit_logs' AS status;
\echo ''

-- Migration 004a: Create Users Table
\echo '📦 Migration 004a: Create Users Table'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'users') THEN '✅' ELSE '❌' END || ' Table users' AS status;
\echo ''

-- Migration 004b: Scheduling Engine
\echo '📦 Migration 004b: Scheduling Engine'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'provider_services') THEN '✅' ELSE '❌' END || ' Table provider_services' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'provider_exceptions') THEN '✅' ELSE '❌' END || ' Table provider_exceptions' AS status;
\echo ''

-- Migration 005: Clinical Notes
\echo '📦 Migration 005: Clinical Notes'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'clinical_notes') THEN '✅' ELSE '❌' END || ' Table clinical_notes' AS status;
\echo ''

-- Migration 006: Waitlist
\echo '📦 Migration 006: Waitlist'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_class WHERE relname = 'waitlist') THEN '✅' ELSE '❌' END || ' Table waitlist' AS status;
\echo ''

-- Migration 007: Multi-Provider RAG Isolation
\echo '📦 Migration 007: Multi-Provider RAG Isolation'
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_policies WHERE policyname = 'kb_tenant_isolation') THEN '✅' ELSE '❌' END || ' Policy kb_tenant_isolation' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_policies WHERE policyname = 'provider_tenant_isolation') THEN '✅' ELSE '❌' END || ' Policy provider_tenant_isolation' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_kb_provider') THEN '✅' ELSE '❌' END || ' Index idx_kb_provider' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patients_provider') THEN '✅' ELSE '❌' END || ' Index idx_patients_provider' AS status;
SELECT '  ' || CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_provider') THEN '✅' ELSE '❌' END || ' Index idx_conversations_provider' AS status;
\echo ''

-- Summary
\echo '=============================================='
\echo '📊 RAG FAQ Data Check'
\echo '=============================================='
SELECT COUNT(*) AS faq_entries_in_knowledge_base FROM knowledge_base WHERE is_active = true;
\echo ''

\echo '📊 Providers in Production'
\echo '=============================================='
SELECT id, name, email, specialty, timezone, provider_id FROM providers ORDER BY id;
\echo ''

\echo '=============================================='
\echo '📊 Tables Summary'
\echo '=============================================='
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
\echo ''
