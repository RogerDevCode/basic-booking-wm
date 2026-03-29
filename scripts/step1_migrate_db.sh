#!/bin/bash
# STEP 1: Run Database Migrations (NEON ONLY)
set -e
echo "Running database migrations on NEON..."
psql "$NEON_DATABASE_URL" -f database/migrations/003_single_provider_migration.sql
psql "$NEON_DATABASE_URL" -f database/migrations/004_phase9_cleanup.sql
echo "✅ Migrations complete on NEON!"
