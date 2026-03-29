# 🔍 DATABASE AUDIT INSTRUCTIONS

**Date:** 2026-03-28  
**Status:** Ready to execute

---

## 📋 PRE-REQUISITES

You need:
1. PostgreSQL server running
2. Database `bookings` created
3. Migrations executed (003, 004)

---

## 🚀 EXECUTE AUDIT

### Option 1: Full Audit (Recommended)

```bash
# Connect and run audit
psql -U booking -h localhost -d bookings -f scripts/audit_database_schema.sql
```

### Option 2: Quick Checks

```bash
# Check tables exist
psql -U booking -h localhost -d bookings -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
"

# Check system_config
psql -U booking -h localhost -d bookings -c "
SELECT config_key, config_value 
FROM system_config 
ORDER BY config_key;
"

# Check single provider/service
psql -U booking -h localhost -d bookings -c "
SELECT 
    (SELECT COUNT(*) FROM providers WHERE is_active = true) as active_providers,
    (SELECT COUNT(*) FROM services WHERE is_active = true) as active_services;
"
```

### Option 3: Docker Compose

If using Docker:

```bash
# Start PostgreSQL
docker-compose -f docker-compose.dev/docker-compose.yml up -d postgres

# Wait for startup
sleep 5

# Run audit
docker-compose -f docker-compose.dev/docker-compose.yml exec postgres psql -U booking -d bookings -f /scripts/audit_database_schema.sql
```

---

## ✅ EXPECTED RESULTS

### Tables (8 required)
- ✓ bookings
- ✓ providers
- ✓ services
- ✓ patients
- ✓ system_config
- ✓ circuit_breaker_state
- ✓ booking_locks
- ✓ booking_dlq

### System Config (6+ entries)
- ✓ single_provider_id (UUID)
- ✓ single_service_id (UUID)
- ✓ service_duration_min (60)
- ✓ service_buffer_min (10)
- ✓ booking_max_advance_days (90)
- ✓ booking_min_advance_hours (2)
- ✓ provider_name (optional)
- ✓ gcal_calendar_id (optional)

### Active Records
- ✓ 1 active provider
- ✓ 1 active service

---

## 📊 AUDIT CHECKLIST

Run these queries manually:

```sql
-- 1. Check provider_id is UUID
SELECT data_type 
FROM information_schema.columns 
WHERE table_name = 'providers' 
  AND column_name = 'provider_id';
-- Expected: uuid

-- 2. Check service_id is UUID
SELECT data_type 
FROM information_schema.columns 
WHERE table_name = 'services' 
  AND column_name = 'service_id';
-- Expected: uuid

-- 3. Check bookings has UUID fields
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
  AND column_name IN ('booking_id', 'provider_id', 'service_id', 'patient_id');
-- Expected: all uuid

-- 4. Check status values
SELECT DISTINCT status FROM bookings;
-- Expected: pending, confirmed, in_service, completed, cancelled, no_show, rescheduled

-- 5. Check helper functions
SELECT get_single_provider_id();
SELECT get_single_service_id();
-- Expected: UUID values

-- 6. Check triggers
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name LIKE '%validate%';
-- Expected: trg_validate_system_config

-- 7. Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'system_config';
-- Expected: idx_system_config_key, idx_system_config_updated_at
```

---

## 🐛 TROUBLESHOOTING

### Issue: "relation system_config does not exist"

**Solution:** Run migration 003
```bash
psql -U booking -h localhost -d bookings -f database/migrations/003_single_provider_migration.sql
```

### Issue: "function get_single_provider_id() does not exist"

**Solution:** Migration 003 not fully executed. Re-run:
```bash
psql -U booking -h localhost -d bookings -f database/migrations/003_single_provider_migration.sql
```

### Issue: "provider_services" table still exists

**Solution:** Migration 003 drops it automatically. If it still exists:
```bash
psql -U booking -h localhost -d bookings -c "DROP TABLE IF EXISTS provider_services CASCADE;"
```

---

## 📝 MANUAL VERIFICATION (No DB Required)

If you can't connect to DB now, verify code structure:

```bash
# 1. Check Go types match DB
grep -A 20 "type Booking struct" pkg/types/types.go

# 2. Check queries use correct columns
grep -n "SELECT.*FROM bookings" internal/*/*.go

# 3. Check status constants
grep -A 10 "const (" pkg/types/types.go | grep Status

# 4. Check migration creates tables
grep -A 5 "CREATE TABLE" database/migrations/003_single_provider_migration.sql
```

---

## ✅ AUDIT REPORT

After running audit, check:
- `docs/DATABASE_CODE_AUDIT_REPORT.md` - Full correspondence report
- `docs/DEPLOYMENT_GUIDE.md` - Next steps

---

**Audit Script:** `scripts/audit_database_schema.sql`  
**Audit Report:** `docs/DATABASE_CODE_AUDIT_REPORT.md`  
**Status:** ✅ Ready to execute
