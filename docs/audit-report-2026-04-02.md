# BOOKING TITANIUM — AUDIT REPORT v2.3.1

**Date:** 2026-04-02
**Project:** booking-titanium-wm
**Package Version:** 2.3.1
**Language:** TypeScript (Windmill scripts)
**Runtime:** Node.js >= 20.0.0 / Bun >= 1.0.0
**Database:** PostgreSQL (Neon)
**Total TypeScript Files:** 30 (excluding tests)
**Total Test Files:** 5
**Total n8n Workflows:** 32 JSON files
**Total Migration Files:** 4
**Total Windmill Flows:** 3 YAML files

---

## 1. SCRIPT INVENTORY AND STATUS

### 1.1 Core Booking Scripts (f/)

| # | Script | File | Lines | Status | Tests | Quality |
|---|--------|------|-------|--------|-------|---------|
| 1 | `booking_create` | `f/booking_create/main.ts` | 270 | **COMPLETE** | Yes (input validation only) | Good -- Zod validation, idempotency, audit trail |
| 2 | `booking_cancel` | `f/booking_cancel/main.ts` | 141 | **COMPLETE** | Yes (input validation only) | Good -- State validation, actor permission, audit |
| 3 | `booking_reschedule` | `f/booking_reschedule/main.ts` | 242 | **COMPLETE** | Yes (input validation only) | Good -- Atomic reschedule, links old/new bookings |
| 4 | `booking_orchestrator` | `f/booking_orchestrator/main.ts` | 351 | **COMPLETE** | No | Good -- Dynamic imports, intent routing |
| 5 | `availability_check` | `f/availability_check/main.ts` | 275 | **COMPLETE** | Yes (input validation only) | Good -- Slot generation, override handling |
| 6 | `booking_wizard` | `f/booking_wizard/main.ts` | 420 | **COMPLETE** | Yes (mocked) | Fair -- Single-provider only, no DB transaction |

### 1.2 GCal Sync Scripts

| # | Script | File | Lines | Status | Tests | Quality |
|---|--------|------|-------|--------|-------|---------|
| 7 | `gcal_sync` | `f/gcal_sync/main.ts` | 297 | **COMPLETE** | No | Good -- Retry with backoff, create/update/delete |
| 8 | `gcal_reconcile` | `f/gcal_reconcile/main.ts` | 301 | **COMPLETE** | No | Good -- Cron reconciliation, batch processing |
| 9 | `gcal_webhook_renew` | `f/gcal_webhook_renew/` | 0 | **EMPTY** | No | **MISSING -- Directory exists but no files** |
| 10 | `gcal_webhook_setup` | `f/gcal_webhook_setup/` | 0 | **EMPTY** | No | **MISSING -- Directory exists but no files** |

### 1.3 Notification Scripts

| # | Script | File | Lines | Status | Tests | Quality |
|---|--------|------|-------|--------|-------|---------|
| 11 | `telegram_send` | `f/telegram_send/main.ts` | 252 | **COMPLETE** | No | Excellent -- 3 keyboard modes, retry, markdown sanitization |
| 12 | `gmail_send` | `f/gmail_send/main.ts` | 321 | **COMPLETE** | No | Excellent -- HTML templates, action links, retry |
| 13 | `reminder_cron` | `f/reminder_cron/main.ts` | 328 | **COMPLETE** | No | Good -- 30min/2h/24h windows, preference-aware |
| 14 | `reminder_config` | `f/reminder_config/main.ts` | 215 | **COMPLETE** | No | Good -- Preference toggles, JSONB storage |

### 1.4 Telegram Interaction Scripts

| # | Script | File | Lines | Status | Tests | Quality |
|---|--------|------|-------|--------|-------|---------|
| 15 | `telegram_callback` | `f/telegram_callback/main.ts` | 374 | **COMPLETE** | No | Good -- Inline button actions, markdown escaping |
| 16 | `telegram_menu` | `f/telegram_menu/main.ts` | 129 | **COMPLETE** | No | Fair -- Static menu, no DB interaction |

### 1.5 Internal Scripts

| # | Script | File | Lines | Status | Tests | Quality |
|---|--------|------|-------|--------|-------|---------|
| 17 | `ai_agent/main` | `f/internal/ai_agent/main.ts` | 650 | **COMPLETE** | Yes (3 test suites) | Excellent -- Hybrid LLM+rules, guardrails, tracing |
| 18 | `ai_agent/constants` | `f/internal/ai_agent/constants.ts` | 199 | **COMPLETE** | N/A | Excellent -- SSOT for intents, keywords, thresholds |
| 19 | `ai_agent/types` | `f/internal/ai_agent/types.ts` | 130 | **COMPLETE** | N/A | Excellent -- Zod schemas, discriminated unions |
| 20 | `ai_agent/prompt-builder` | `f/internal/ai_agent/prompt-builder.ts` | 233 | **COMPLETE** | N/A | Excellent -- 7-section prompt, few-shot examples |
| 21 | `ai_agent/llm-client` | `f/internal/ai_agent/llm-client.ts` | 163 | **COMPLETE** | N/A | Good -- Groq+OpenAI fallback, retry |
| 22 | `ai_agent/guardrails` | `f/internal/ai_agent/guardrails.ts` | 185 | **COMPLETE** | N/A | Excellent -- Injection detection, unicode, JSON parsing |
| 23 | `ai_agent/tracing` | `f/internal/ai_agent/tracing.ts` | 52 | **COMPLETE** | N/A | Good -- Structured logging |
| 24 | `message_parser/main` | `f/internal/message_parser/main.ts` | 125 | **COMPLETE** | No | Fair -- Manual SQL sanitization (legacy pattern) |
| 25 | `result.ts` | `f/internal/result.ts` | 16 | **COMPLETE** | N/A | Minimal -- Result type utility |

### 1.6 Flow Scripts

| # | Script | File | Status |
|---|--------|------|--------|
| 26 | `telegram_webhook_trigger.ts` | `f/flows/telegram_webhook__flow/` | Complete |
| 27 | `check_parser_error.ts` | `f/flows/telegram_webhook__flow/` | Complete |

### 1.7 Summary: Script Coverage

- **Total script directories:** 18
- **With main.ts:** 16
- **Empty directories:** 2 (`gcal_webhook_renew/`, `gcal_webhook_setup/`)
- **Scripts with tests:** 3 directories (booking_create, booking_wizard, ai_agent)
- **Scripts without tests:** 13 directories

---

## 2. DATABASE SCHEMA STATUS

### 2.1 Migration Files

| Migration | File | Purpose | Status |
|-----------|------|---------|--------|
| 001 | `001_add_exclude_constraint.sql` | GiST EXCLUDE for booking overlap prevention | **COMPLETE** |
| 002 | `002_optimize_indexes.sql` | Composite and partial indexes | **COMPLETE** |
| 003 | `003_complete_schema_overhaul.sql` | Full schema alignment with AGENTS.md S10 | **COMPLETE** (572 lines) |
| Seed | `seed_rag_faqs.sql` | RAG knowledge base seeding (20 FAQs) | **COMPLETE** |

### 2.2 Tables vs AGENTS.md S10 Specification

| Table | AGENTS.md S10 | Migration 003 | Dev Init SQL | Status |
|-------|---------------|---------------|--------------|--------|
| `providers` | UUID PK, specialty, telegram, gcal, timezone | **MATCHES** | SERIAL INT (OUTDATED) | Migration 003 correct |
| `services` | UUID PK, provider_id FK, duration, buffer, price | **MATCHES** | SERIAL INT (OUTDATED) | Migration 003 correct |
| `patients` | UUID PK, email, phone, telegram, gcal, metadata | **CREATED** | **MISSING** | Migration 003 correct |
| `bookings` | UUID PK, patient_id FK, idempotency, gcal sync, reminders | **CREATED** | UPPERCASE status (OUTDATED) | Migration 003 correct |
| `provider_schedules` | day_of_week, start/end time, is_active | **CREATED** | **MISSING** | Migration 003 correct |
| `schedule_overrides` | date, is_blocked, reason | **CREATED** | **MISSING** | Migration 003 correct |
| `booking_audit` | from/to status, changed_by, actor_id | **CREATED** | **MISSING** | Migration 003 correct |
| `knowledge_base` | pgvector embedding, category | **CREATED** | **MISSING** | Migration 003 correct |
| `conversations` | channel, direction, intent | **CREATED** | **MISSING** | Migration 003 correct |
| `system_config` | key/value JSONB | **CREATED** | **MISSING** | Migration 003 correct |
| `circuit_breaker_state` | state machine | **CREATED** | EXISTS | Both match |
| `booking_locks` | distributed locks | **CREATED** | EXISTS | Both match |
| `booking_dlq` | dead letter queue | **CREATED** | EXISTS | Both match |

### 2.3 Schema Issues Found

**CRITICAL: Dev init SQL is OUTDATED** (`docker-compose.dev/database/init/001_init.sql`)
- Uses `SERIAL INT` for providers/services (should be UUID)
- Uses UPPERCASE status values (`CONFIRMED`, `CANCELLED`) instead of lowercase
- Missing: `patients`, `provider_schedules`, `schedule_overrides`, `booking_audit`, `knowledge_base`, `conversations` tables
- Missing: `btree_gist`, `vector` extensions
- Missing: GiST exclusion constraint
- Missing: `reminder_30min_sent` column in bookings
- The dev init SQL represents the OLD schema; migration 003 is the CORRECT schema

---

## 3. TEST COVERAGE

### 3.1 Test Files

| Test File | Lines | Tests | Coverage Area |
|-----------|-------|-------|---------------|
| `f/booking_create/main.test.ts` | 130 | 10 | Input validation for create, cancel, reschedule, availability |
| `f/booking_wizard/main.test.ts` | exists | exists | Wizard flow (mocked SQL) |
| `f/internal/ai_agent/main.test.ts` | 685 | ~35 | Urgency, context, preferences, entity extraction, user profiles |
| `f/internal/ai_agent/redteam.test.ts` | 206 | ~25 | Intent collision, false positives, keyword weighting |
| `f/internal/ai_agent/main.comprehensive.test.ts` | 906 | 100 | 100 real-world queries across 10 categories |

### 3.2 Coverage Assessment

| Component | Tested | Test Type | Coverage |
|-----------|--------|-----------|----------|
| AI Agent intent classification | YES | Integration (100+ queries) | **EXCELLENT** |
| AI Agent entity extraction | YES | Integration | **EXCELLENT** |
| AI Agent guardrails | NO | No dedicated tests | **NONE** |
| AI Agent LLM client | NO | No dedicated tests | **NONE** |
| Booking create | PARTIAL | Input validation only | **FAIR** (no DB integration) |
| Booking cancel | PARTIAL | Input validation only | **FAIR** |
| Booking reschedule | PARTIAL | Input validation only | **FAIR** |
| Booking wizard | PARTIAL | Mocked SQL | **FAIR** |
| Availability check | PARTIAL | Input validation only | **FAIR** |
| GCal sync | NO | No tests | **NONE** |
| GCal reconcile | NO | No tests | **NONE** |
| Telegram send | NO | No tests | **NONE** |
| Gmail send | NO | No tests | **NONE** |
| Reminder cron | NO | No tests | **NONE** |
| Telegram callback | NO | No tests | **NONE** |
| Message parser | NO | No tests | **NONE** |

### 3.3 Test Gap Summary

- **Total scripts:** 16 with main.ts
- **Scripts with any tests:** 3 (19%)
- **Scripts with integration tests:** 1 (AI Agent)
- **Scripts with zero tests:** 13 (81%)
- **No DB integration tests exist** -- all booking tests validate input schemas only, never hit a database
- **No E2E tests exist** -- no full flow tests from webhook to booking to notification

---

## 4. SECURITY ISSUES

### 4.1 CRITICAL

1. **`sql.unsafe()` usage in `reminder_cron/main.ts`** (lines 191, 263)
   - Column names are interpolated via `sql.unsafe(column)` where `column` comes from a hardcoded `Record<ReminderWindow, string>` map
   - Risk: LOW in practice (values are hardcoded), but violates the parameterized SQL invariant (AGENTS.md LAW-08)
   - Location: `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/reminder_cron/main.ts`

2. **Hardcoded credentials in `.env.test`**
   - Contains `postgresql://booking:booking123@localhost:5433/bookings`
   - Password `booking123` is committed to repository
   - Location: `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/.env.test`

3. **Dev init SQL uses plaintext default credentials**
   - No password set in docker-compose.dev for PostgreSQL
   - Location: `/home/manager/Sync/wildmill-proyects/booking-titanium-wm/docker-compose.dev/database/init/001_init.sql`

### 4.2 HIGH

4. **GCal access token read from env without validation**
   - `process.env['GCAL_ACCESS_TOKEN']` used directly in GCal API calls
   - No token refresh mechanism implemented
   - Location: `f/gcal_sync/main.ts`, `f/gcal_reconcile/main.ts`

5. **LLM API keys exposed via `wmill.env` fallback**
   - `llm-client.ts` reads GROQ_API_KEY and OPENAI_API_KEY from both `wmll.env` and `process.env`
   - If running outside Windmill, keys come from process.env which could leak in logs
   - Location: `f/internal/ai_agent/llm-client.ts`

6. **No rate limiting on Telegram bot API calls**
   - `telegram_send/main.ts` has retry logic but no rate limiting
   - Telegram has strict rate limits (30 messages/second per bot)
   - Location: `f/telegram_send/main.ts`

### 4.3 MEDIUM

7. **PII potentially logged in trace output**
   - `tracing.ts` logs `chat_id` in JSON -- while not direct PII, it can be correlated
   - `console.log` in tracing fallback could expose data in non-Windmill environments
   - Location: `f/internal/ai_agent/tracing.ts`

8. **`Record<string, unknown>` used extensively for DB query results**
   - 38 occurrences across the codebase
   - Loses type safety; any field access is untyped
   - Should use proper interfaces or Zod inference

9. **No input length limits on Telegram callback_data**
   - Telegram limits callback_data to 64 bytes; `telegram_callback/main.ts` validates 64 chars but doesn't account for multi-byte UTF-8
   - Location: `f/telegram_callback/main.ts` line 14

### 4.4 LOW

10. **`require()` used instead of `import` for postgres**
    - Several scripts use `const postgres = require('postgres')` with eslint-disable
    - Works but defeats static analysis
    - Affected: booking_create, booking_orchestrator, gcal_reconcile, gcal_sync, availability_check, booking_cancel, booking_reschedule, reminder_config

---

## 5. CODE QUALITY ISSUES

### 5.1 TypeScript Issues

1. **`require()` instead of `import`** (9 files)
   - All use `// eslint-disable-next-line @typescript-eslint/no-require-imports`
   - Prevents tree-shaking and static analysis
   - Files: booking_create, booking_orchestrator, gcal_reconcile, gcal_sync, availability_check, booking_cancel, booking_reschedule, reminder_config, and one more

2. **No explicit DB transaction usage in booking_create**
   - INSERT booking and INSERT audit are separate queries, not wrapped in a transaction
   - If audit insert fails, booking exists without audit trail
   - Location: `f/booking_create/main.ts` lines 186-239

3. **No explicit DB transaction in booking_reschedule**
   - Creates new booking, updates old booking, inserts 2 audit entries -- all separate queries
   - If any step fails, partial state could exist
   - Location: `f/booking_reschedule/main.ts` lines 146-211

4. **`booking_wizard` creates bookings without audit trail**
   - `createBookingInDB()` inserts directly without inserting into `booking_audit`
   - Location: `f/booking_wizard/main.ts` lines 182-215

5. **`booking_wizard` uses hardcoded service duration (30min)**
   - Does not query the services table for actual duration
   - Location: `f/booking_wizard/main.ts` line 178

6. **`booking_wizard` uses `Date(year, month-1, day, hour, minute)` -- local timezone**
   - Creates dates in local timezone, then calls `.toISOString()` which converts to UTC
   - This double-converts and can produce wrong timestamps
   - Location: `f/booking_wizard/main.ts` line 177

7. **`reminder_cron` window calculations use `new Date()` arithmetic**
   - Adding milliseconds to `new Date()` can produce incorrect results around DST transitions
   - Location: `f/reminder_cron/main.ts` lines 210-216

### 5.2 Architecture Issues

8. **`booking_orchestrator` uses dynamic `import()` for sibling scripts**
   - Works in Windmill but prevents static analysis and bundling
   - No error handling if imported script fails to load
   - Location: `f/booking_orchestrator/main.ts` lines 73, 117, 165, 209

9. **No circuit breaker implementation in TypeScript scripts**
   - Database tables exist (`circuit_breaker_state`) but no TypeScript script reads or updates them
   - AGENTS.md mentions circuit breakers but they are not implemented in the current codebase

10. **No distributed lock implementation in TypeScript scripts**
    - Tables exist (`booking_locks`) but no TypeScript script uses them
    - Race condition possible under concurrent booking requests (mitigated by DB exclusion constraint)

11. **`message_parser/main.ts` uses manual SQL sanitization**
    - `replaceAll('\\', '\\\\').replaceAll('\'', "''")` is error-prone
    - Should rely on parameterized queries instead
    - Location: `f/internal/message_parser/main.ts` lines 100-102

12. **Duplicate GCal event building logic**
    - `gcal_sync/main.ts` and `gcal_reconcile/main.ts` have nearly identical `buildGCalEvent()` functions
    - Should be extracted to a shared utility

---

## 6. MISSING FEATURES FOR PRODUCTION

### 6.1 Critical Missing

| Feature | Status | Impact |
|---------|--------|--------|
| **GCal webhook renew** | EMPTY directory | GCal push notifications won't work |
| **GCal webhook setup** | EMPTY directory | Cannot register GCal webhooks |
| **DB integration tests** | NONE | Cannot verify booking logic against real DB |
| **E2E tests** | NONE | No full flow validation |
| **Circuit breaker scripts** | Tables exist, no scripts | No resilience to external service failures |
| **Distributed lock scripts** | Tables exist, no scripts | No protection against race conditions beyond DB constraint |

### 6.2 Important Missing

| Feature | Status |
|---------|--------|
| **RAG query script** | Referenced in AGENTS.md S4.3 but not implemented as TypeScript |
| **Conversation history tracking** | Table exists but no script writes to `conversations` table |
| **Provider schedule management script** | No CRUD script for `provider_schedules` |
| **Schedule override management script** | No CRUD script for `schedule_overrides` |
| **GCal token refresh** | Access token is static; no OAuth refresh flow |
| **Health check endpoint** | Referenced in docker-compose but not implemented |
| **Admin dashboard scripts** | No scripts for admin operations |

### 6.3 Nice-to-Have Missing

| Feature | Status |
|---------|--------|
| **Booking search/filter script** | No script to search bookings by date, provider, patient |
| **Provider agenda view** | No script to show provider's daily/weekly schedule |
| **Patient registration flow** | No script to create patients |
| **Service management CRUD** | No scripts to manage services |
| **Multi-provider support** | `booking_wizard` is single-provider only |
| **Payment integration** | Not implemented |
| **Waitlist management** | Not implemented |

---

## 7. INFRASTRUCTURE GAPS

### 7.1 Docker/Deployment

1. **`docker-compose.production.yml` references `Dockerfile.ai-agent` which does not exist**
   - No Dockerfile in the repository root
   - Production deployment is not functional

2. **`docker-compose.dev/database/init/001_init.sql` is OUTDATED**
   - Does not match migration 003 schema
   - Dev environment will have broken schema

3. **Nginx config references `api:8080` upstream**
   - No API server is defined in docker-compose
   - No health check endpoint exists
   - HTTPS is commented out

4. **No `.env.example` or `.env.template` file**
   - No documentation of required environment variables
   - `.env.test` has hardcoded credentials

### 7.2 CI/CD

5. **No CI pipeline configuration**
   - No GitHub Actions, GitLab CI, or similar
   - No automated testing on push/PR

6. **No deployment scripts for production**
   - `scripts/deploy_production.sh` exists but was not read (may be incomplete)

### 7.3 Monitoring

7. **Prometheus/Grafana in production compose but no metrics endpoint**
   - ai-agent health check references `/health` but no such endpoint exists
   - No metrics collection implemented

---

## 8. DEPENDENCY ANALYSIS

### 8.1 Current Dependencies (package.json)

**Production:**
| Package | Version | Used By | Status |
|---------|---------|---------|--------|
| `zod` | ^4.3.6 | All scripts | **ACTIVE** |
| `postgres` | ^3.4.8 | All DB scripts | **ACTIVE** |
| `nodemailer` | ^8.0.4 | gmail_send | **ACTIVE** |
| `googleapis` | ^171.4.0 | NOT USED directly | **UNUSED** -- GCal uses raw fetch() |
| `ioredis` | ^5.3.2 | NOT USED in any script | **UNUSED** |
| `neverthrow` | ^8.2.0 | NOT USED in any script | **UNUSED** |
| `@total-typescript/ts-reset` | ^0.6.1 | ai_agent/main.ts | **ACTIVE** (1 file) |

**Dev:**
| Package | Version | Status |
|---------|---------|--------|
| `typescript` | ^5.9.3 | Active |
| `vitest` | ^1.2.0 | Active |
| `@vitest/coverage-v8` | ^1.2.0 | Active |
| `eslint` | ^8.57.1 | Active (but many eslint-disable comments) |
| `tsx` | ^4.7.0 | Active |

### 8.2 Dependency Issues

- **`googleapis` is installed but NEVER imported** -- GCal sync uses raw `fetch()` calls instead. This adds ~15MB to node_modules unnecessarily.
- **`ioredis` is installed but NEVER imported** -- Redis is in docker-compose but no script connects to it.
- **`neverthrow` is installed but NEVER imported** -- The codebase uses custom `{ success, data, error_message }` pattern instead.
- **`@types/gapi.client.calendar` and `@types/gapi.client.calendar-v3`** -- Both installed, likely redundant.

---

## 9. README AND DOCUMENTATION ISSUES

1. **README.md is STALE and MISLEADING**
   - Claims "Go/Golang" -- project is now TypeScript
   - Claims "Version 1.0.0" -- package.json says 2.3.1
   - Claims "98% Complete - Production Ready" -- many features missing
   - References `go.mod`, `go.sum`, `Makefile` -- none exist
   - References `cmd/`, `internal/`, `pkg/` directories -- none exist
   - References 17 Go scripts -- actual count is 16 TypeScript scripts

2. **No `.env.example` file** -- developers have no reference for required env vars

---

## 10. PRIORITIZED RECOMMENDATIONS

### P0 -- CRITICAL (Fix Immediately)

1. **Update `docker-compose.dev/database/init/001_init.sql`** to match migration 003 schema, OR remove it and run migrations 001-003 on dev startup
2. **Remove hardcoded credentials from `.env.test`** and add to `.gitignore`
3. **Wrap booking_create and booking_reschedule in DB transactions** -- currently not atomic
4. **Add audit trail insertion to `booking_wizard/createBookingInDB()`** -- currently missing
5. **Fix timezone bug in `booking_wizard`** -- `new Date(y,m,d,h,m)` + `.toISOString()` double-converts

### P1 -- HIGH (Fix Before Production)

6. **Implement or remove `gcal_webhook_renew` and `gcal_webhook_setup`** -- empty directories are confusing
7. **Remove unused dependencies:** `googleapis`, `ioredis`, `neverthrow`
8. **Rewrite README.md** to reflect actual TypeScript state
9. **Add DB integration tests** for booking_create, booking_cancel, booking_reschedule
10. **Replace `require('postgres')` with proper `import`** across all scripts
11. **Extract shared `buildGCalEvent()` function** to avoid duplication
12. **Add `.env.example`** with all required environment variables

### P2 -- MEDIUM (Improve Quality)

13. **Implement circuit breaker scripts** or remove the tables
14. **Implement distributed lock scripts** or remove the tables
15. **Add conversation history tracking** -- write to `conversations` table
16. **Replace `Record<string, unknown>` with typed interfaces** for DB query results
17. **Add rate limiting to telegram_send** for Telegram API compliance
18. **Fix `sql.unsafe()` usage in reminder_cron** -- use typed column access
19. **Add GCal token refresh mechanism** -- current approach will break when tokens expire

### P3 -- LOW (Nice to Have)

20. **Add provider/service management CRUD scripts**
21. **Add booking search/filter script**
22. **Implement health check endpoint**
23. **Add CI pipeline** (GitHub Actions)
24. **Add E2E tests** for full Telegram webhook -> booking -> notification flow
25. **Create Dockerfile.ai-agent** for production deployment
26. **Enable HTTPS in nginx.conf**
