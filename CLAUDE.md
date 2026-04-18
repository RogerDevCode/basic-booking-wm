# CLAUDE.md

## 🗺️ Read First — Codebase Index

**Before exploring files**, read these pre-built index files in order:
1. `.ai-codex/index.md` — **auto-generated**: all 40+ modules with mission + real export signatures
2. `.ai-codex/feature-map.md` — folder map by domain (booking / telegram / gcal / web / internal)
3. `.ai-codex/schema.md` — database tables, columns and FSM transitions
4. `.ai-codex/lib.md` — key function signatures for internal/ utilities

> These replace ~40 file reads per session. Regenerate with: `bash scripts/gen-codex-index.sh`

---

## 📌 Quick Reference

### What is this?
**Booking Titanium** — Medical appointment booking system running on Windmill (TypeScript strict mode). Telegram webhook → AI intent detection → atomic DB transactions → Google Calendar sync.

### Key Files
- **AGENTS.md** — Mandatory architecture rules (§MON, §SOLID, §RLS, §DB schema)
- **README.md** — High-level overview, architecture diagrams, quick start
- **audits/audit_mon_compliance_2026-04-17.md** — Latest compliance audit

---

## 🏗️ Architecture at a Glance

### §MON — Split-Monolith (One File = One Responsibility)
Every `f/{feature}/` follows this structure:
```
f/{feature}/
├── main.ts           (Windmill entrypoint — orchestrator ONLY, no logic)
├── types.ts          (type definitions + Zod schemas)
├── service.ts        (business logic — 1 complex function per file)
├── repository.ts     (data access layer)
└── utils.ts          (domain utilities)
```

**Rule:** `main.ts` imports, validates input, calls service/repository, returns result. NO business logic in main.

### Key Services
- **booking_orchestrator** — Routes intents (create/cancel/reschedule/list/general Q) to handlers
- **booking_create** — Atomic transaction: validate → lock provider → check overlap → insert → sync GCal
- **booking_cancel** / **booking_reschedule** — State machine validation + DB mutation
- **telegram_callback** — Telegram webhook handler; routes to booking_orchestrator
- **gcal_sync** — Real-time Google Calendar synchronization (fire-and-forget)
- **gcal_reconcile** — Cron job (5min) retries failed GCal syncs with exponential backoff
- **reminder_cron** — Scheduled reminders (24h/2h/30min before appointment)

### Data Flow
```
Telegram User Message
  ↓
telegram_callback (webhook)
  ↓
booking_orchestrator (NLU intent detection)
  ↓
booking_create|cancel|reschedule|... (atomic DB transaction)
  ↓
Database (single source of truth)
  ↓
gcal_sync (async GCal update)
  ↓
telegram_send (confirmation back to user)
```

---

## 🛠️ Development Commands

### Setup
```bash
cp .env.example .env
npm install
docker-compose -f docker-compose.dev.yml up -d db
```

### Testing
```bash
npm test                          # Run all tests (344 passed, 37 skipped)
npm test -- f/booking_create      # Run single feature tests
npm run test:watch                # Watch mode
npm run test:ui                   # Vitest UI
npm run test:coverage             # Coverage report
```

### Type Checking
```bash
npm run typecheck                 # TypeScript strict check
tsc --strict --noEmit             # Raw tsc command
npx eslint 'f/**/*.ts'            # ESLint validation
```

### Recent Refactoring (April 2026)
```bash
git log --oneline -5
# 120eab8 fix: Update wizard-bubble tests (Result tuple API)
# 4514aeb docs: Update audit status (2 violations fixed)
# 5695d29 refactor: Split reminder_cron and web_booking_api per §MON
```

---

## 📋 Mandatory Architecture Rules (§AGENTS.md)

Before ANY code change, read these sections in AGENTS.md:

1. **§LAW — Inviolable Laws**
   - ❌ `any`, `as Type`, `throw` in business logic
   - ✅ `unknown` + Zod validation, `[error, null]` Result pattern, `Readonly<T>`

2. **§MON — Split-Monolith**
   - One responsibility per `.ts` file
   - `main.ts` = orchestrator only (imports + validation + dispatch)
   - Never generic `services.ts`, `utils.ts`, `helpers.ts` dumps

3. **§SOLID**
   - SRP: Extract separate functions (not combined logic)
   - DIP: Inject `DBClient`, never import `pg` in business logic
   - ISP: No god-repositories (BookingRepository ≠ ScheduleRepository)

4. **§DB — Database Schema (Absolute Truth)**
   - Tables: providers, services, provider_schedules, clients, bookings
   - GIST exclusion prevents double-booking
   - RLS tenant isolation: `withTenantContext` wraps ALL DB ops
   - Idempotency key: every write uses `idempotency_key`

5. **§RLS — Multi-Tenant Isolation**
   - `WHERE provider_id = $1` is NOT enough security
   - `SET LOCAL app.current_tenant = $1` in transaction
   - Never `pool.query` outside tenant context

6. **§5.1 — NLU Intent Vocabulary (Spanish only)**
   - 'ver_disponibilidad' | 'crear_cita' | 'cancelar_cita' | 'reagendar_cita' | 'mis_citas' | 'duda_general' | 'fuera_de_contexto'
   - Thresholds in `f/nlu/constants.ts` (one definition only)

7. **§DEL — Delivery Requirements**
   - Zero `// TODO`, mocks, placeholders
   - `tsc --strict --noEmit` + ESLint clean
   - Structured log on every error path before `return [error, null]`

---

## 🔍 How to Add a Feature

**Example: Add new booking status (e.g., 'en_espera')**

1. **Update §DB schema** (AGENTS.md §DB)
   - Add to VALID_TRANSITIONS in booking_fsm/types.ts
   - Create migration if needed

2. **Create atomic operation**
   ```
   f/booking_update/
   ├── main.ts (60 lines)
   ├── service.ts (validate status, execute update)
   ├── repository.ts (DB update query)
   ├── types.ts (InputSchema, StatusUpdate interface)
   └── utils.ts (if needed)
   ```

3. **Update intent router** (booking_orchestrator)
   - Add handler to HANDLER_MAP
   - Test with vitest

4. **Validate**
   ```bash
   tsc --strict --noEmit
   npx eslint f/booking_update/*.ts
   npm test -- f/booking_update
   ```

5. **Commit**
   - Message: "feat: Add booking status 'en_espera' per §MON"
   - Include Co-Author tag

---

## 🚨 Common Pitfalls

| ❌ Don't | ✅ Do |
|---------|------|
| Business logic in `main.ts` | Delegate to `service.ts` |
| Generic `services.ts` with 15 exports | One file per responsibility (§MON) |
| Direct `pool.query()` (RLS bypass) | Wrap in `withTenantContext()` |
| `throw new Error()` | `return [new Error(...), null]` |
| `as Type` casts | Zod `.parse()` + type guards |
| Hardcoded confidence thresholds | Define once in `f/nlu/constants.ts` |
| Mock providers in tests | Use real TestContainers (PostgreSQL) |
| Floating promises | `await` or `Promise.allSettled()` |

---

## 📊 Compliance Tracker

**Current State (2026-04-17):**
- **§MON Compliance:** 90.6% (up from 77.5%)
- **Tests Passing:** 344/381 (90.1%)
- **TypeScript Strict:** ✅ Zero errors
- **ESLint:** ✅ Clean

**Recent Fixes:**
- ✅ wizard-bubble tests: Fixed Result tuple API (7 tests)

---

## 🔗 Reference Links

- **AGENTS.md** — Complete architecture law
- **README.md** — Feature overview + diagrams
- **audits/** — Latest compliance audit
- **vitest.config.ts** — Test configuration (TestContainers PostgreSQL)
- **tsconfig.json** + **tsconfig.strict.json** — TypeScript configuration

---

## ❓ Questions?

1. **"How do I know if my code breaks §MON?"**
   - If a file exports >3 different concerns → §MON violation
   - If `main.ts` contains business logic → §MON violation
   - Run: `npm run typecheck` + `npx eslint`

2. **"How do I add a new database table?"**
   - Define in AGENTS.md §DB section
   - Add RLS policy
   - Create migration file (if Windmill-hosted)
   - Add type in affected `.ts` files

3. **"Why Result tuple instead of thrown exceptions?"**
   - Windmill scripts don't catch exceptions gracefully
   - Result tuple allows explicit error handling
   - Enables composition without try/catch chains
   - See §LAW in AGENTS.md

4. **"Where do I put shared logic?"**
   - If used in 3+ modules → `f/internal/{module}` folder
   - Never generic `helpers.ts`; name after the responsibility
   - Export single function per file (except `types.ts`)

---

**Last Updated:** 2026-04-17 | **Compliance:** 90.6% | **Tests:** 344/381 ✅
