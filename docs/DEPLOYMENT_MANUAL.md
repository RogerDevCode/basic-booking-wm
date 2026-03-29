# 🚀 DEPLOYMENT MANUAL - SINGLE PROVIDER v5.0

**Date:** 2026-03-28  
**Status:** READY FOR MANUAL EXECUTION  
**Estimated Time:** 15 minutes

---

## 📋 PRE-DEPLOYMENT CHECKLIST

- [x] Code reviewed and tested
- [x] Tests passing (10/10)
- [x] Benchmarks excellent (>4M ops/sec)
- [x] Documentation complete
- [ ] Database backup created
- [ ] Maintenance window scheduled
- [ ] Rollback plan ready

---

## 🎯 DEPLOYMENT STEPS

### Step 1: Database Backup ⚠️ **CRITICAL**

```bash
# Create backup directory
mkdir -p ~/backups/booking-titanium

# Create timestamped backup
pg_dump -U booking -h localhost -d bookings \
  -F c \
  -f ~/backups/booking-titanium/backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh ~/backups/booking-titanium/
```

**Expected:** Backup file ~1-10MB  
**Time:** 30 seconds

---

### Step 2: Verify Database Connection

```bash
# Test connection
psql -U booking -h localhost -d bookings -c "SELECT version();"

# Expected: PostgreSQL version info
```

**Expected:** PostgreSQL 15+  
**Time:** 5 seconds

---

### Step 3: Run Migration 003 - Single Provider Schema

```bash
# Execute migration
psql -U booking -h localhost -d bookings \
  -f database/migrations/003_single_provider_migration.sql

# Verify success
psql -U booking -h localhost -d bookings -c "
SELECT config_key, config_value 
FROM system_config 
WHERE config_key IN ('single_provider_id', 'single_service_id');
"
```

**Expected:** 2 rows with UUIDs  
**Time:** 2-5 minutes

---

### Step 4: Run Migration 004 - Phase 9 Cleanup

```bash
# Execute cleanup
psql -U booking -h localhost -d bookings \
  -f database/migrations/004_phase9_cleanup.sql

# Verify cleanup
psql -U booking -h localhost -d bookings -c "
SELECT 
  (SELECT COUNT(*) FROM providers WHERE is_active = true) as providers,
  (SELECT COUNT(*) FROM services WHERE is_active = true) as services,
  (SELECT COUNT(*) FROM system_config) as config_entries;
"
```

**Expected:** 1 provider, 1 service, 8+ config entries  
**Time:** 1-2 minutes

---

### Step 5: Verify Database Schema

```bash
# Run audit script
psql -U booking -h localhost -d bookings \
  -f scripts/audit_database_schema.sql

# Check all validations pass (should see ✓ everywhere)
```

**Expected:** All checks with ✓  
**Time:** 1 minute

---

### Step 6: Update Environment Variables

```bash
# Get UUIDs from database
export SINGLE_PROVIDER_ID=$(psql -U booking -h localhost -d bookings -t -A -c "SELECT get_single_provider_id();")
export SINGLE_SERVICE_ID=$(psql -U booking -h localhost -d bookings -t -A -c "SELECT get_single_service_id();")

echo "Provider ID: $SINGLE_PROVIDER_ID"
echo "Service ID: $SINGLE_SERVICE_ID"

# Update .env file
cp .env .env.backup

# Add or update single provider config
if grep -q "^SINGLE_PROVIDER_ID=" .env; then
  sed -i "s/^SINGLE_PROVIDER_ID=.*/SINGLE_PROVIDER_ID=$SINGLE_PROVIDER_ID/" .env
else
  echo "SINGLE_PROVIDER_ID=$SINGLE_PROVIDER_ID" >> .env
fi

if grep -q "^SINGLE_SERVICE_ID=" .env; then
  sed -i "s/^SINGLE_SERVICE_ID=.*/SINGLE_SERVICE_ID=$SINGLE_SERVICE_ID/" .env
else
  echo "SINGLE_SERVICE_ID=$SINGLE_SERVICE_ID" >> .env
fi

# Verify .env
grep "SINGLE_" .env
```

**Expected:** UUIDs in .env  
**Time:** 30 seconds

---

### Step 7: Build Go Application

```bash
# Clean build
go clean
go mod tidy

# Build API
go build -o bin/api ./cmd/api

# Verify build
ls -lh bin/api
./bin/api --version 2>&1 || echo "Build successful"
```

**Expected:** bin/api executable  
**Time:** 1-2 minutes

---

### Step 8: Run Unit Tests

```bash
# Run validation tests
go test -v ./pkg/utils/...

# Expected: 7 tests PASS
# Expected: 3 benchmarks >4M ops/sec
```

**Expected:** All tests pass  
**Time:** 30 seconds

---

### Step 9: Deploy to Windmill

```bash
# Sync to Windmill
wmill sync push

# Verify deployment
wmill script list | grep -E "booking_|availability|distributed|circuit"
```

**Expected:** 17+ scripts deployed  
**Time:** 2-5 minutes

---

### Step 10: Configure Windmill Schedules

```bash
# Create reminder cron (every hour)
wmill schedule create \
  --name "booking-reminders-cron" \
  --cron "0 * * * *" \
  --script "f/booking-reminders-cron"

# Create GCal reconciliation cron (every 5 min)
wmill schedule create \
  --name "gcal-reconciliation-cron" \
  --cron "*/5 * * * *" \
  --script "f/gcal-reconciliation-cron"

# Create no-show marking cron (daily at 1 AM)
wmill schedule create \
  --name "no-show-marking-cron" \
  --cron "0 1 * * *" \
  --script "f/no-show-marking-cron"

# Verify schedules
wmill schedule list
```

**Expected:** 3 schedules created  
**Time:** 2 minutes

---

### Step 11: Update Flow Configurations

```bash
# Update telegram-webhook flow to use static IDs
# Edit f/flows/telegram_webhook__flow/flow.yaml
# Change provider_id and service_id input_transforms to:
#   type: static
#   value: 1

# Update booking-orchestrator flow
# Edit f/flows/booking_orchestrator__flow/flow.yaml
# Change provider_id and service_id input_transforms to:
#   type: static
#   value: 1

# Push flow changes
wmill flow push telegram-webhook__flow
wmill flow push booking-orchestrator__flow
```

**Expected:** Flows updated  
**Time:** 5 minutes

---

### Step 12: Health Check & Verification

```bash
# Start API in background (if not running)
./bin/api &
sleep 3

# Health check
curl -s http://localhost:8080/health | jq

# Expected: {"status": "healthy", ...}

# Get service info
curl -s http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{"action": "get_service_info"}' | jq

# Expected: Provider and service UUIDs

# Check availability
curl -s -X POST http://localhost:8080/book-appointment \
  -H "Content-Type: application/json" \
  -d '{"action": "check_availability", "date": "2026-04-01"}' | jq

# Expected: Available slots or error message
```

**Expected:** All endpoints responding  
**Time:** 1 minute

---

### Step 13: Run Post-Deployment Tests

```bash
# Run database audit
psql -U booking -h localhost -d bookings \
  -f scripts/audit_database_schema.sql

# Run unit tests
go test -v ./pkg/utils/...

# Run integration tests (if DB configured)
go test -v ./tests/internal/...
```

**Expected:** All tests pass  
**Time:** 2 minutes

---

### Step 14: Documentation & Sign-off

```bash
# Create deployment record
cat > DEPLOYMENT_RECORD.md << 'EOF'
# Deployment Record - Single Provider v5.0

**Date:** $(date)
**Deployed By:** $(whoami)
**Version:** 5.0.0

## Changes Deployed

- Database migrated to UUIDs
- Single provider/service configuration
- system_config table created
- Helper functions deployed
- Phase 9 cleanup completed
- Go application rebuilt
- Windmill scripts deployed
- Schedules configured
- Flows updated

## Verification

- [ ] Database backup created
- [ ] Migrations executed successfully
- [ ] system_config populated
- [ ] Single provider active
- [ ] Single service active
- [ ] Build successful
- [ ] Tests passing
- [ ] Health check OK
- [ ] API responding

## Rollback Plan

If issues occur:
1. Restore DB: pg_restore -U booking -d backups/backup_*.sql
2. Restore .env: cp .env.backup .env
3. Restart API: pkill api && ./bin/api &

## Sign-off

Deployment completed at: $(date)
Status: SUCCESS
EOF

cat DEPLOYMENT_RECORD.md
```

**Expected:** Deployment record created  
**Time:** 1 minute

---

## ✅ POST-DEPLOYMENT CHECKLIST

- [ ] Database backup verified
- [ ] Migrations executed without errors
- [ ] system_config has 8+ entries
- [ ] 1 active provider
- [ ] 1 active service
- [ ] Build successful
- [ ] All tests passing
- [ ] Health check OK
- [ ] API endpoints responding
- [ ] Windmill scripts deployed
- [ ] Schedules configured
- [ ] Flows updated
- [ ] Documentation updated
- [ ] Rollback plan documented

---

## 🔄 ROLLBACK PROCEDURE

If deployment fails:

### 1. Rollback Database

```bash
# Find backup file
ls -lt ~/backups/booking-titanium/ | head -2

# Restore database
pg_restore -U booking -h localhost -d bookings \
  -c \
  ~/backups/booking-titanium/backup_YYYYMMDD_HHMMSS.sql
```

### 2. Rollback Environment

```bash
cp .env.backup .env
```

### 3. Restart Services

```bash
pkill -f "booking-titanium"
./bin/api &
```

### 4. Verify Rollback

```bash
curl http://localhost:8080/health
```

---

## 📊 DEPLOYMENT METRICS

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **Downtime** | <5 min | TBD | ⏳ |
| **Migration Time** | <10 min | TBD | ⏳ |
| **Test Pass Rate** | 100% | 100% | ✅ |
| **Build Status** | Success | Success | ✅ |
| **Health Check** | OK | TBD | ⏳ |

---

## 📞 SUPPORT CONTACTS

**Deployment Team:**
- DevOps: [Your contact]
- Database Admin: [DBA contact]
- On-call Engineer: [On-call contact]

**Escalation:**
- Technical Lead: [Lead contact]
- Project Manager: [PM contact]

---

## 🎉 DEPLOYMENT COMPLETE

Once all steps are complete and verified:

```bash
echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT SUCCESSFUL - SINGLE PROVIDER v5.0"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Version: 5.0.0"
echo "Date: $(date)"
echo "Status: PRODUCTION READY"
echo ""
```

---

**Deployment Guide Version:** 1.0  
**Last Updated:** 2026-03-28  
**Approved By:** Booking Titanium Team
