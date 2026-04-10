# Migration Execution Order — CANONICAL REFERENCE
# Generated: 2026-04-08
# 
# WARNING: Running migrations out of order WILL corrupt the database.
# ALWAYS run migrations via this order file, never individually.
#
# DUPLICATE NUMBERING RESOLUTION:
#   - 001_rls_enable.sql (keep) — 001_add_exclude_constraint.sql (OBSOLETE, skip)
#   - 002_optimize_indexes.sql (keep) — 002_state_machine_trigger.sql (keep, run after)
#   - 008_create_tags_system.sql (run FIRST) — 008_clients_nm_relationship.sql (run SECOND)
#   - 009_cleanup_orphan_tables.sql (run FIRST) — 009_complete_remaining.sql (run SECOND)

# ============================================================================
# EXECUTION ORDER (dependency-verified)
# ============================================================================

# Phase 1: Foundation — tables and extensions
003_complete_schema_overhaul.sql

# Phase 2: GIST exclusion — double-booking prevention (MUST come before any data)
004_add_gist_exclude_constraint.sql

# Phase 3: Provider normalization — id → provider_id
005_normalize_providers.sql

# Phase 4: Service normalization — legacy → modern columns
006_normalize_services.sql

# Phase 5: Booking normalization — drop legacy columns, add new ones
007_normalize_bookings.sql

# Phase 6: Client N:M relationship — remove provider_id from clients
008_clients_nm_relationship.sql

# Phase 7: Tags system — categories, tags, note_tags
008_create_tags_system.sql

# Phase 8: Cleanup orphan tables
009_cleanup_orphan_tables.sql

# Phase 9: Complete remaining — conversations table, missing indexes
009_complete_remaining.sql

# Phase 10: Provider schema completion
010_complete_provider_schema.sql

# Phase 11: Data encryption — encrypted columns, audit tables
011_data_encryption.sql

# Phase 12: RLS enablement + critical indexes
012_rls_indexes_fix.sql

# Phase 13: Migration order fix + FK completion
013_migration_order_fix.sql

# ============================================================================
# SKIP THESE (obsolete or handled by later migrations):
# ============================================================================
# SKIP: 001_add_exclude_constraint.sql — OBSOLETE, replaced by 004
# SKIP: 001_rls_enable.sql — Handled by 012_rls_indexes_fix.sql
# SKIP: 002_optimize_indexes.sql — Indexes lost by 003 CASCADE, re-created by 012+013
# SKIP: 002_state_machine_trigger.sql — Trigger re-created by 003 schema overhaul

# ============================================================================
# VERIFICATION QUERIES (run after all migrations):
# ============================================================================
# SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
# SELECT COUNT(*) AS fk_count FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
# SELECT COUNT(*) AS index_count FROM pg_indexes WHERE schemaname = 'public';
# SELECT conname, conrelid::regclass AS table_name FROM pg_constraint WHERE contype = 'f' ORDER BY conrelid::regclass::text;
# SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
