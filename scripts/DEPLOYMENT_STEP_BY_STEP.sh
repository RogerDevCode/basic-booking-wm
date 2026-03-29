#!/bin/bash

# ============================================================================
# DEPLOYMENT EXECUTION GUIDE - STEP BY STEP
# ============================================================================
# Este script NO se ejecuta automáticamente - sigue los pasos manualmente
# 
# IMPORTANTE: Ejecuta cada paso y verifica el resultado antes de continuar
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT EXECUTION GUIDE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "IMPORTANT: Execute each step manually and verify before continuing"
echo ""

# ============================================================================
# STEP 1: NEON DATABASE IS ALWAYS RUNNING
# ============================================================================
echo "STEP 1: Verify NEON Database Connection"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "NEON database is cloud-based and always running."
echo "No action needed - just verify connection:"
echo ""
echo "Execute:"
echo "  psql \"\$NEON_DATABASE_URL\" -c \"SELECT version();\""
echo ""
echo "✅ When connection is verified, press ENTER to continue..."
read -r

# ============================================================================
# STEP 2: CREATE DATABASE BACKUP
# ============================================================================
echo ""
echo "STEP 2: Create Database Backup"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  mkdir -p ~/backups/booking-titanium"
echo "  pg_dump \"\$NEON_DATABASE_URL\" -F c -f ~/backups/booking-titanium/backup_\$(date +%Y%m%d_%H%M%S).sql"
echo ""
echo "Verify:"
echo "  ls -lh ~/backups/booking-titanium/"
echo ""
echo "✅ When backup is complete, press ENTER to continue..."
read -r

# ============================================================================
# STEP 3: RUN DATABASE MIGRATIONS
# ============================================================================
echo ""
echo "STEP 3: Run Database Migrations"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute Migration 003 (Single Provider Schema):"
echo "  psql \"\$NEON_DATABASE_URL\" -f database/migrations/003_single_provider_migration.sql"
echo ""
echo "Execute Migration 004 (Phase 9 Cleanup):"
echo "  psql \"\$NEON_DATABASE_URL\" -f database/migrations/004_phase9_cleanup.sql"
echo ""
echo "Verify:"
echo "  psql \"\$NEON_DATABASE_URL\" -c \"SELECT config_key, config_value FROM system_config ORDER BY config_key;\""
echo ""
echo "Expected: 8+ configuration entries"
echo ""
echo "✅ When migrations are complete, press ENTER to continue..."
read -r

# ============================================================================
# STEP 4: PUSH WINDMILL RESOURCES
# ============================================================================
echo ""
echo "STEP 4: Push Resources to Windmill"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  cd resources"
echo "  for f in *.json; do"
echo "    wmill resource push --file \"\$f\""
echo "  done"
echo ""
echo "Verify:"
echo "  wmill resource list"
echo ""
echo "Expected: 8 resources (postgres_neon, telegram_bot, gmail_smtp, etc.)"
echo ""
echo "✅ When resources are pushed, press ENTER to continue..."
read -r

# ============================================================================
# STEP 5: DEPLOY SCRIPTS TO WINDMILL
# ============================================================================
echo ""
echo "STEP 5: Deploy Scripts to Windmill"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  wmill sync push"
echo ""
echo "This will deploy:"
echo "  - booking_create"
echo "  - booking_cancel"
echo "  - booking_reschedule"
echo "  - booking_orchestrator"
echo "  - availability_check"
echo "  - distributed_lock_acquire_single"
echo "  - distributed_lock_release"
echo "  - circuit_breaker_check"
echo "  - circuit_breaker_record"
echo "  - gcal_create_event"
echo "  - gcal_delete_event"
echo "  - gmail_send"
echo "  - telegram_send"
echo "  - get_providers"
echo "  - get_services"
echo "  And more..."
echo ""
echo "Verify:"
echo "  wmill script list | grep -E 'booking_|availability|distributed|circuit'"
echo ""
echo "✅ When scripts are deployed, press ENTER to continue..."
read -r

# ============================================================================
# STEP 6: UPDATE FLOWS FOR SINGLE PROVIDER
# ============================================================================
echo ""
echo "STEP 6: Update Flows for Single Provider"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Edit f/flows/telegram_webhook__flow/flow.yaml:"
echo "  Change provider_id input_transform to:"
echo "    type: static"
echo "    value: 1"
echo "  Change service_id input_transform to:"
echo "    type: static"
echo "    value: 1"
echo ""
echo "Edit f/flows/booking_orchestrator__flow/flow.yaml:"
echo "  Same changes as above"
echo ""
echo "Then push flows:"
echo "  wmill flow push telegram-webhook__flow"
echo "  wmill flow push booking-orchestrator__flow"
echo ""
echo "Verify:"
echo "  wmill flow list"
echo ""
echo "✅ When flows are updated, press ENTER to continue..."
read -r

# ============================================================================
# STEP 7: CREATE WINDMILL SCHEDULES
# ============================================================================
echo ""
echo "STEP 7: Create Windmill Schedules (Cron Jobs)"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  wmill schedule create --name 'booking-reminders' --cron '0 * * * *' --script 'f/booking-reminders-cron'"
echo "  wmill schedule create --name 'gcal-reconciliation' --cron '*/5 * * * *' --script 'f/gcal-reconciliation-cron'"
echo "  wmill schedule create --name 'no-show-marking' --cron '0 1 * * *' --script 'f/no-show-marking-cron'"
echo ""
echo "Verify:"
echo "  wmill schedule list"
echo ""
echo "Expected: 3 schedules created"
echo ""
echo "✅ When schedules are created, press ENTER to continue..."
read -r

# ============================================================================
# STEP 8: BUILD AND START API
# ============================================================================
echo ""
echo "STEP 8: Build and Start API"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  go build -o bin/api ./cmd/api"
echo "  ./bin/api &"
echo ""
echo "Verify:"
echo "  curl http://localhost:8080/health"
echo ""
echo "Expected: {\"status\": \"healthy\", ...}"
echo ""
echo "✅ When API is running, press ENTER to continue..."
read -r

# ============================================================================
# STEP 9: RUN POST-DEPLOYMENT TESTS
# ============================================================================
echo ""
echo "STEP 9: Run Post-Deployment Tests"
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Execute:"
echo "  go test -v ./pkg/utils/..."
echo "  go test -bench=. ./pkg/utils/..."
echo ""
echo "Database audit:"
echo "  psql \"\$NEON_DATABASE_URL\" -f scripts/audit_database_schema.sql"
echo ""
echo "Expected: All checks with ✓"
echo ""
echo "✅ When tests pass, press ENTER to continue..."
read -r

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✓ Database migrated"
echo "  ✓ Resources pushed"
echo "  ✓ Scripts deployed"
echo "  ✓ Flows updated"
echo "  ✓ Schedules created"
echo "  ✓ API running"
echo "  ✓ Tests passing"
echo ""
echo "Version: 5.0.0"
echo "Date: $(date)"
echo "Status: PRODUCTION READY"
echo ""
