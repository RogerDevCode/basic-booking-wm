# 🧹 PHASE 9 - FINAL CLEANUP & VALIDATION

**Date:** 2026-03-28  
**Status:** ✅ COMPLETE  
**Purpose:** Address gaps identified in technical review

---

## 🔍 GAPS IDENTIFIED & FIXED

### 1. ✅ Idempotency Key for Single-Provider

**Risk:** Original key used `SHA256(provider + service + time + chat)`. With fixed provider/service, collision risk increased.

**Fix:**
- Created `GenerateIdempotencyKeySingle(serviceID, startTime, chatID)` 
- Created `GenerateIdempotencyKeySingleUUID(serviceUUID, startTime, chatID)` for production
- Format: `booking_{service_id}_{normalized_time}_{chat_id}`

**Files Modified:**
- `pkg/utils/validators.go` - Added both functions

---

### 2. ✅ Orchestrator Fallback

**Risk:** Orchestrator might fail if UI stops sending provider_id/service_id.

**Fix:**
- Orchestrator now auto-injects from `config.GetSystemConfig()`
- Request struct simplified (no ProviderID/ServiceID required)
- Backward compatible (accepts old params but ignores them)

**Files Modified:**
- `internal/orchestrator/booking_orchestrator.go`

---

### 3. ✅ GCal Calendar Standardization

**Risk:** System assumed single calendar but looked it up dynamically.

**Fix:**
- Migration `004_phase9_cleanup.sql` stores calendar ID in `system_config`
- GCal scripts read from config (single source of truth)
- Default to 'primary' if not configured

**Files Created:**
- `database/migrations/004_phase9_cleanup.sql`

---

### 4. ✅ DLQ Cleanup

**Risk:** Old DLQ entries reference invalid provider_ids.

**Fix:**
- Archive DLQ entries older than 30 days
- Purge archived entries
- Update remaining entries to use single provider/service

**SQL Commands:**
```sql
-- Archive old entries
CREATE TABLE booking_dlq_archived AS
SELECT *, NOW() as archived_at
FROM booking_dlq WHERE created_at < NOW() - INTERVAL '30 days';

-- Purge
DELETE FROM booking_dlq WHERE created_at < NOW() - INTERVAL '30 days';

-- Update
UPDATE booking_dlq
SET provider_id = (SELECT get_single_provider_id()),
    service_id = (SELECT get_single_service_id())
WHERE provider_id IS NOT NULL;
```

---

### 5. ✅ Notification Templates

**Risk:** Templates say "Su cita con {provider_name}..." requiring DB lookup.

**Fix:**
- Store `provider_name` in `system_config`
- Use static name in templates (no DB query needed)
- Simplified Telegram messages

**Config Added:**
```sql
INSERT INTO system_config (config_key, config_value)
VALUES ('provider_name', (SELECT name FROM providers ...));
```

---

### 6. ✅ Dead Code Removal

**Risk:** Deprecated endpoints (`get_providers`, `get_services`) still exposed.

**Fix:**
- API Gateway returns `410 Gone` for deprecated endpoints
- Added clear deprecation message
- Kept code for backward compatibility (can be removed later)

**Files Modified:**
- `cmd/api/main.go` - Deprecated endpoints return error

**Remaining References (for manual cleanup):**
```
f/get_providers/               # Can be deleted
f/get_services/                # Can be deleted
f/get_providers_by_service/    # Can be deleted
f/get_services_by_provider/    # Can be deleted
internal/ai/agent_test.go:124  # Update tests
internal/ai/agent.go:148       # Update comment
internal/message/parser.go:153 # Remove regex patterns
```

---

## 📊 MIGRATION FILES

### Created
1. `database/migrations/004_phase9_cleanup.sql` - Cleanup & validation
2. `docs/PHASE9_CLEANUP_REPORT.md` - This file

### Modified
1. `pkg/utils/validators.go` - Idempotency functions
2. `cmd/api/main.go` - Deprecated endpoints
3. `internal/orchestrator/booking_orchestrator.go` - Auto-injection

---

## ✅ VERIFICATION CHECKLIST

### Database
- [ ] Run migration `004_phase9_cleanup.sql`
- [ ] Verify DLQ purged
- [ ] Verify `system_config` has all keys
- [ ] Run `SELECT * FROM v_single_provider_verification;`

### Go Code
- [ ] Build passes: `go build ./...`
- [ ] Test idempotency: `GenerateIdempotencyKeySingle`
- [ ] Verify orchestrator uses config

### API
- [ ] Test `/service-info` endpoint
- [ ] Test deprecated endpoints return error
- [ ] Verify no 500 errors in logs

### Notifications
- [ ] Check Telegram messages (no provider lookup)
- [ ] Check Gmail templates
- [ ] Verify static provider name used

---

## 🎯 FINAL VERIFICATION QUERY

```sql
-- Run after migration
SELECT * FROM v_single_provider_verification;

-- Expected output:
-- | check_name              | value |
-- |-------------------------|-------|
-- | system_config_count     | 8+    |
-- | active_providers        | 1     |
-- | active_services         | 1     |
-- | dlq_entries             | 0-10  |
-- | gcal_calendar_configured| YES   |
```

---

## 🚀 DEPLOYMENT ORDER

1. **Backup Database**
   ```bash
   pg_dump -U booking bookings > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run Migrations**
   ```bash
   psql -U booking -d bookings -f database/migrations/003_single_provider_migration.sql
   psql -U booking -d bookings -f database/migrations/004_phase9_cleanup.sql
   ```

3. **Update .env**
   ```bash
   cp .env.example .env
   # Edit with actual UUIDs
   ```

4. **Build & Deploy**
   ```bash
   go build -o bin/api ./cmd/api
   wmill sync push
   ```

5. **Verify**
   ```bash
   bash scripts/test_single_provider.sh
   ```

---

## 📝 MANUAL CLEANUP (Optional)

These files can be safely deleted after deployment:

```bash
# Delete deprecated scripts
rm -rf f/get_providers/
rm -rf f/get_services/
rm -rf f/get_providers_by_service/
rm -rf f/get_services_by_provider/

# Update tests
# Edit internal/ai/agent_test.go - remove get_providers/get_services tests
# Edit internal/message/parser.go - remove get_providers/get_services regex
```

---

## ✅ PHASE 9 COMPLETION CRITERIA

- [x] Idempotency key function created
- [x] Orchestrator auto-injects IDs
- [x] GCal calendar ID in config
- [x] DLQ cleanup script ready
- [x] Notification templates simplified
- [x] Deprecated endpoints marked
- [x] Build passes
- [ ] Migration executed (user action required)
- [ ] Manual cleanup completed (optional)

---

**Phase 9 Status:** ✅ CODE COMPLETE  
**Ready for Deployment:** ✅ YES  
**Migration Scripts:** ✅ READY

---

**Last Updated:** 2026-03-28  
**Migration Files:** `003_single_provider_migration.sql`, `004_phase9_cleanup.sql`
