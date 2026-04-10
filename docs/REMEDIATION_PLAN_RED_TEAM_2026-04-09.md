# REMEDIATION PLAN — RED TEAM FINDINGS
**Date:** 2026-04-09
**Source:** Independent Red Team Audit
**Total Findings:** 7 (3 P0, 2 P1, 2 P2)
**Estimated Effort:** 3-5 days

---

## PHASE 0: P0 — CRITICAL (Block Deployment)

### P0-1: Idempotency Key Hallucination
**Severity:** P0 — CRITICAL | **Finding #1**
**Files:** `f/web_booking_api/main.ts` (lines 135, 242)
**Root Cause:** `crypto.randomUUID()` as fallback neutralizes idempotency semantics.

#### Problem
```typescript
// Line 135 — create_booking
const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();
// Line 242 — reschedule
const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();
```
If client retries without sending `idempotency_key`, each retry generates a new UUID. The DB sees a unique key each time. Double-booking or double-insert occurs.

#### Fix — Per-File Steps

**Step 1: Make `idempotency_key` required in Zod schema**
```typescript
// Line 62 — change from .optional() to required
idempotency_key: z.string().min(1).max(255),
```

**Step 2: Remove fallback at line 135**
```typescript
// BEFORE:
const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();
// AFTER:
const idempotencyKey = parsed.data.idempotency_key;
```

**Step 3: Remove fallback at line 242**
Same pattern as Step 2.

**Step 4: Remove `crypto` import if no longer used**
Check if `crypto` is imported; remove if dead code.

**Step 5: Update API contract documentation**
The web API now requires `idempotency_key` on create/reschedule. Document this.

**Verification:**
```bash
grep -n "crypto.randomUUID" f/web_booking_api/main.ts  # Should return 0 matches
grep -n "idempotency_key.*optional" f/web_booking_api/main.ts  # Should return 0 matches
```

---

### P0-2: Concurrency Schizophrenia — Missing FOR UPDATE
**Severity:** P0 — CRITICAL | **Finding #2**
**Files:** `f/web_booking_api/main.ts` (create_booking path, ~line 120-170)
**Root Cause:** `booking_create` uses `SELECT ... FOR UPDATE` on provider; `web_booking_api` does not.

#### Problem
`booking_create/main.ts` locks the provider row:
```sql
SELECT provider_id, name, timezone FROM providers
WHERE provider_id = ${input.provider_id}::uuid AND is_active = true
LIMIT 1 FOR UPDATE
```
`web_booking_api/main.ts` does NOT. Two concurrent web requests to the same slot → GIST constraint fires → client gets 500 error instead of graceful "slot taken" message. Worse: potential deadlock under load.

#### Fix — Per-File Steps

**Step 1: Read `web_booking_api/main.ts` create path (lines ~100-170)**
Identify where the INSERT happens without provider lock.

**Step 2: Add SELECT FOR UPDATE on provider row before INSERT**
Inside the `withTenantContext` transaction, before the overlap check:
```sql
SELECT provider_id FROM providers
WHERE provider_id = ${provider_id}::uuid AND is_active = true
LIMIT 1 FOR UPDATE
```

**Step 3: Mirror the same pattern in reschedule path (lines ~220-270)**
Same `SELECT ... FOR UPDATE` before the overlap check.

**Step 4: Ensure GIST constraint error is caught and converted to user-friendly message**
The catch block or error handling should detect `booking_no_overlap` or `exclusion constraint` violations and return `409 Conflict` with "slot already booked."

**Verification:**
```bash
grep -n "FOR UPDATE" f/web_booking_api/main.ts  # Should return 2 matches (create + reschedule)
```

---

### P0-3: Type-Casting Hypocrisy in GCal Reconciler
**Severity:** P0 — CRITICAL | **Finding #3**
**Files:** `f/gcal_reconcile/main.ts` (lines 132, 197, 217), `f/booking_cancel/main.ts` (line 219)
**Root Cause:** `as Type` casts bypass type safety. GCal API response shape is trusted blindly.

#### Problem
```typescript
// Line 132 — raw JSON cast, no validation
const data = (await response.json()) as GCalEventResponse;

// Lines 197, 217 — double cast through Record<string, unknown>
result.providerEventId = (providerResult.data as Record<string, unknown>)['id'] as string | null ?? null;

// booking_cancel line 219 — zero UUID with as UUID cast
booking_id: toUUID(updated.booking_id) ?? '00000000-0000-0000-0000-000000000000' as UUID,
```

#### Fix — Per-File Steps

**File: f/gcal_reconcile/main.ts**

**Step 1: Define Zod schema for GCal Event response**
```typescript
const GCalEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }),
  status: z.string().optional(),
}).passthrough();
```

**Step 2: Replace line 132 cast with Zod parse**
```typescript
// BEFORE:
const data = (await response.json()) as GCalEventResponse;
// AFTER:
const raw = await response.json();
const parsed = GCalEventSchema.safeParse(raw);
if (!parsed.success) {
  return { ok: false, error: `Invalid GCal response: ${parsed.error.message}` };
}
const data = parsed.data;
```

**Step 3: Replace lines 197/217 with type guard**
```typescript
// Extract 'id' safely from unknown response
function extractGCalId(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'id' in data) {
    const id = (data as Record<string, unknown>)['id'];
    return typeof id === 'string' ? id : null;
  }
  return null;
}
// Usage:
result.providerEventId = extractGCalId(providerResult.data);
result.clientEventId = extractGCalId(clientResult.data);
```

**File: f/booking_cancel/main.ts**

**Step 4: Replace line 219 — zero UUID cast**
```typescript
// BEFORE:
booking_id: toUUID(updated.booking_id) ?? '00000000-0000-0000-0000-000000000000' as UUID,
// AFTER:
const bookingId = toUUID(updated.booking_id);
if (bookingId === null) {
  return [new Error('cancel_failed: invalid booking_id from DB'), null];
}
booking_id: bookingId,
```

**Verification:**
```bash
grep -n "as GCalEventResponse\|as UUID" f/gcal_reconcile/main.ts f/booking_cancel/main.ts  # Should return 0
```

---

## PHASE 1: P1 — HIGH (Fix This Sprint)

### P1-1: NULL_TENANT_UUID Loophole — Global Audit
**Severity:** P1 — HIGH | **Finding #4**
**Files:** 19 files (see audit output)
**Root Cause:** `NULL_TENANT_UUID` used as fallback when tenant ID cannot be extracted.

#### Problem
20 files fall back to `'00000000-0000-0000-0000-000000000000'` when they can't find a tenant ID. This silently passes RLS (which filters to zero rows) OR creates a global bypass if any RLS policy is misconfigured.

#### Fix — Per-File Strategy

**Category A: System scripts (cron, no-show trigger, health check)**
These legitimately run without tenant context. They should iterate providers and open per-tenant context.

| File | Fix |
|:---|:---|
| `gcal_sync/main.ts:195` | Iterate providers → `withTenantContext(each.provider_id)` |
| `noshow_trigger/main.ts:77` | Iterate providers → `withTenantContext(each.provider_id)` |
| `conversation_logger/main.ts` | Already fixed (requires `provider_id`) |

**Category B: Web endpoints — require valid tenant ID**
| File | Fix |
|:---|:---|
| `web_booking_api/main.ts:85` | `provider_id ?? user_id` → reject if both undefined |
| `web_waitlist/main.ts:95` | `client_id ?? user_id` → reject if both undefined |
| `web_provider_notes/main.ts:365` | Already has `input.provider_id` — remove `??` |
| `web_provider_profile/main.ts:215` | Already has `input.provider_id` — remove `\|\|` |
| `web_patient_profile/main.ts:84` | `user_id` must be required |

**Category C: Auth endpoints (unauthenticated — legitimate)**
| File | Fix |
|:---|:---|
| `web_auth_login/main.ts:105` | Legitimate for login — use a separate non-RLS query |
| `web_auth_me/main.ts:87` | Must require authenticated user ID |
| `web_auth_complete_profile/main.ts:146` | Must require tenant ID from session |

**Category D: Admin endpoints**
| File | Fix |
|:---|:---|
| `web_admin_provider_crud/main.ts:371` | Require `provider_id` — reject if missing |
| `web_admin_tags/main.ts:352` | Require `admin_user_id` — reject if missing |
| `web_admin_specialties_crud/main.ts:176` | Require explicit tenant — reject if missing |

**Category E: Key-scanning (already partially fixed)**
| File | Status |
|:---|:---|
| `provider_manage/main.ts:99` | ☐ Still uses key-scanning — needs fix |
| `dlq_processor/main.ts:146` | ☐ Still uses key-scanning — needs fix |
| `web_patient_bookings/main.ts:95` | ☐ Still uses key-scanning — needs fix |
| `web_admin_specialties_crud/main.ts:176` | ☐ Still uses key-scanning — needs fix |
| `web_auth_login/main.ts:105` | ☐ Still uses key-scanning — needs fix |

**Verification:**
```bash
grep -rn "NULL_TENANT_UUID" --include="*.ts" f/ | grep -v test | grep -v node_modules | grep -v "import" | grep -v "export const" | wc -l
# Target: 0 (or limited to auth login / health check)
```

---

### P1-2: z.any() at Telegram API Edge
**Severity:** P1 — HIGH | **Finding #5**
**Files:** `f/telegram_gateway/main.ts` (line 89)
**Root Cause:** `message: z.any().optional()` disables all validation on callback_query.message field.

#### Fix

**Step 1: Replace `z.any()` with `z.unknown()`**
```typescript
// BEFORE:
message: z.any().optional(),
// AFTER:
message: z.unknown().optional(),
```

**Step 2: If message content is ever accessed, add type guard at point of use**
```typescript
function isTelegramMessage(obj: unknown): obj is { text?: string; from?: { id: number } } {
  return typeof obj === 'object' && obj !== null;
}
```

**Verification:**
```bash
grep -n "z\.any()" f/telegram_gateway/main.ts  # Should return 0
```

---

## PHASE 2: P2 — MODERATE (Next Sprint)

### P2-1: RAG Context Trust-Based Security
**Severity:** P2 — MODERATE | **Finding #6**
**Files:** `f/internal/ai_agent/rag-context.ts`
**Root Cause:** `buildRAGContext(tx: postgres.Sql, ...)` accepts raw `postgres.Sql`, allowing caller to bypass RLS.

#### Fix

**Step 1: Define branded tenant-scoped transaction type**
```typescript
// In f/internal/tenant-context/index.ts
declare const TenantScopedTx: unique symbol;
export type TenantScopedTx = postgres.Sql & { readonly [TenantScopedTx]: true };
```

**Step 2: Change `buildRAGContext` signature**
```typescript
// BEFORE:
export async function buildRAGContext(
  tx: postgres.Sql,
  query: string,
  topK?: number,
): Promise<RAGContextResult>

// AFTER:
export async function buildRAGContext(
  tx: TenantScopedTx,
  query: string,
  topK?: number,
): Promise<RAGContextResult>
```

**Step 3: Update caller in `ai_agent/main.ts`**
The caller already uses `withTenantContext`, so the `tx` passed is already tenant-scoped. Cast to `TenantScopedTx`:
```typescript
return buildRAGContext(tx as TenantScopedTx, text, 3);
```

**Note:** This is compile-time enforcement only. The runtime behavior doesn't change because the caller is already correct.

---

### P2-2: Test Suite Consistency (throw in tests)
**Severity:** P2 — LOW | **Finding #7**
**Files:** Test files
**Root Cause:** Tests use `throw new Error()` instead of assertion framework.

#### Fix
Defer until test framework migration. Not a production risk.

---

## EXECUTION ORDER

```
PHASE 0 (P0) — MUST complete before deploy:
  1. P0-1: Idempotency key (web_booking_api) — 30 min
  2. P0-2: SELECT FOR UPDATE (web_booking_api) — 1 hr
  3. P0-3: GCal Zod schemas (gcal_reconcile + booking_cancel) — 2 hrs

PHASE 1 (P1) — Same sprint as P0:
  4. P1-1: NULL_TENANT_UUID elimination — 4 hrs (19 files)
  5. P1-2: z.any() → z.unknown() (telegram_gateway) — 15 min

PHASE 2 (P2) — Next sprint:
  6. P2-1: TenantScopedTx branding — 2 hrs
  7. P2-2: Test consistency — backlog
```

---

## VERIFICATION CHECKLIST (Post-Remediation)

```bash
# P0-1: No auto-generated idempotency keys
grep -rn "crypto.randomUUID" --include="*.ts" f/ | grep -v test  # 0 matches

# P0-2: FOR UPDATE in all booking creation paths
grep -rn "FOR UPDATE" --include="*.ts" f/  # ≥3 matches (booking_create + web_booking_api ×2)

# P0-3: No as Type casts in gcal_reconcile
grep -rn "as GCalEventResponse\|as UUID" --include="*.ts" f/gcal_reconcile/ f/booking_cancel/  # 0 matches

# P1-1: NULL_TENANT_UUID only in import/export
grep -rn "NULL_TENANT_UUID" --include="*.ts" f/ | grep -v test | grep -v "import\|export const"  # ≤3 matches (auth, health check)

# P1-2: No z.any() in production code
grep -rn "z\.any()" --include="*.ts" f/ | grep -v test  # 0 matches
```

---

## RISK ASSESSMENT

| Fix | Risk | Mitigation |
|:---|:---:|:---|
| P0-1: Require idempotency_key | BREAKING — API clients must send it | Document in API changelog; 1-week migration window |
| P0-2: FOR UPDATE | Minor perf impact (locks) | Acceptable — correctness over throughput |
| P0-3: Zod for GCal | GCal API change could break parsing | Zod schema catches it early vs silent corruption |
| P1-1: Remove NULL_TENANT_UUID | May break unauthenticated endpoints | Auth endpoints handled separately; system scripts iterate |
| P1-2: z.any() → z.unknown() | Low — message field not accessed | Safe change |
| P2-1: TenantScopedTx | Compile-time only, no runtime change | Zero risk |

---

**TOTAL ESTIMATED EFFORT:** 8-10 hours of focused work across 7 findings.
