# FIX PLAN — Audit AUDIT_2026-04-10T18-00-53Z (Community-Validated)

**Generated:** 2026-04-10
**Source audit:** `audits/AUDIT_2026-04-10T18-00-53Z.md`
**Community validation:** `docs/COMMUNITY_VALIDATION_FIX_PLAN.md` — 88% confidence
**Status:** Verified by Architect + community sources (TypeScript-ESLint, OneUptime, wellally, thoughtbot, PostgreSQL RLS guides)
**Approach:** One phase at a time. Each phase is atomic, self-contained, and independently verifiable.

---

## VERIFICATION SUMMARY

| # | Finding | Audit Claim | Architect Verification | Community Verdict |
|---|---|---|---|---|
| 1 | CRITICAL-001 | Test tampering (6 modified, 2 deleted) | 6 modified = legitimate contract adaptations. 2 deleted = intentional removal. | **CLOSED — no action** |
| 2 | CRITICAL-002 | English intent `"greeting"` in cache test | **CONFIRMED** — `f/internal/cache/index.test.ts` lines 40, 62, 80 | ✅ **100% aligned** — universal agreement on enum over string literals |
| 3 | CRITICAL-003 | Hardcoded `NULL_TENANT_UUID` export | **CONFIRMED** — 15 callers | ✅ **Strongly aligned** — RLS bypass universally condemned; community endorses `BYPASSRLS` for system roles |
| 4 | HIGH-001 | `as` casts and `z.any()` | **PARTIAL** — 221 `as Type` casts. `z.any()` only in comment. | ⚠️ **80% aligned** — Zod `.safeParse()` preferred over custom guards; `as Record` accepted for unknown external data |
| 5 | MEDIUM-001 | Hardcoded confidence thresholds | **CONFIRMED** — 18 hardcoded literals | ✅ **90% aligned** — magic number extraction is consensus; spec invariants (types.ts §5.1) stay inline |

---

## FIX ORDER

```
Phase 1 → CRITICAL-002 (cache English intent)     — 2 files, zero risk
Phase 2 → MEDIUM-001 (confidence centralization)   — 3 files, low risk
Phase 3 → HIGH-001 (as cast elimination)           — 5 cited files, medium risk
Phase 4 → CRITICAL-003 (NULL_TENANT_UUID removal)  — 15 files, HIGH risk — requires operator approval
```

---

## PHASE 1 — CRITICAL-002: English Intent `"greeting"` in Cache Test

**Severity:** CRITICAL | **Files:** 2 | **Risk:** None | **Community alignment:** 100%

### Problem
`f/internal/cache/index.test.ts` uses literal `"greeting"` (English) instead of `INTENT.SALUDO` (Spanish). `CacheEntry.intent` is typed as `string` — no enum enforcement. Violation of AGENTS.md §5.1 NLU vocabulary mandate.

### Fix

**File: `f/internal/cache/index.ts`**

| Line | Current | Fix |
|---|---|---|
| 14 | `readonly intent: string;` | `readonly intent: IntentType;` (import from `../ai_agent/constants`) |

**File: `f/internal/cache/index.test.ts`**

| Line | Current | Fix |
|---|---|---|
| 1 | _(no import)_ | `import { INTENT, type IntentType } from '../ai_agent/constants';` |
| 40 | `intent: "greeting",` | `intent: INTENT.SALUDO,` |
| 62 | `.toBe("greeting")` | `.toBe(INTENT.SALUDO)` |
| 80 | `"greeting", 1800` | `INTENT.SALUDO, 1800` |

### Verification
```bash
npx vitest run f/internal/cache/index.test.ts
grep -n '"greeting"' f/internal/cache/index.test.ts   # 0 matches
```

---

## PHASE 2 — MEDIUM-001: Confidence Threshold Centralization

**Severity:** MEDIUM | **Files:** 3 | **Risk:** Low | **Community alignment:** 90%

### Problem
18 hardcoded numeric confidence values in `main.ts`. `CONFIDENCE_THRESHOLDS` exists in constants but is not used for escalation thresholds or rule-based detection confidence.

### Analysis — Three Distinct Concepts

| Concept | What it controls | Current location | Values |
|---|---|---|---|
| **Detection thresholds** | Min confidence to accept an intent | `CONFIDENCE_THRESHOLDS` in constants.ts | Per-intent (0.0–0.5) |
| **Escalation thresholds** | When to route to human/priority queue | Hardcoded in `main.ts` lines 281, 286, 287, 531 | 0.8, 0.6, 0.4 |
| **Rule confidence values** | Confidence assigned by rule-based detection | Hardcoded in `main.ts` lines 428–488 | 0.1–0.9 |
| **Social fast-path values** | Confidence from social detection | Hardcoded in `main.ts` lines 647–652 | 0.85–0.95 |
| **LLM prompt examples** | Illustrative JSON in system prompt | `prompt-builder.ts` lines 172–292 | 0.85–0.95 |

**IMPORTANT:** LLM prompt examples in `prompt-builder.ts` must NOT be parameterized. They teach the LLM what output looks like. Converting to `${CONSTANT}` would produce unreadable prompt text.

### Fix

**Step 1 — Add to `f/internal/ai_agent/constants.ts`:**

```typescript
// ESCALATION THRESHOLDS — When to route to human/priority queue
// Separate from CONFIDENCE_THRESHOLDS (detection minimums per intent)
export const ESCALATION_THRESHOLDS = Object.freeze({
  medical_emergency_min: 0.8,    // urgency + this → medical_emergency escalation
  priority_queue_max: 0.6,       // urgency + below this → priority_queue
  human_handoff_max: 0.4,        // non-social + below this → human_handoff
  tfidf_minimum: 0.4,            // TF-IDF minimum to accept result
});

// RULE-BASED DETECTION CONFIDENCE — Values returned by detectIntentRules()
export const RULE_CONFIDENCE_VALUES = Object.freeze({
  urgencia_medical: 0.9,
  reminder_rule: 0.85,
  reschedule_rule: 0.8,
  cancel_rule: 0.8,
  availability_rule: 0.7,
  desconocido: 0.1,
});

// SOCIAL FAST-PATH CONFIDENCE — Values from detectSocial()
export const SOCIAL_CONFIDENCE_VALUES = Object.freeze({
  greeting_exact: 0.95,
  greeting_phrase: 0.9,
  farewell_exact: 0.95,
  farewell_phrase: 0.9,
  thank_you: 0.95,
  off_topic: 0.85,
});
```

**Step 2 — Update `f/internal/ai_agent/main.ts`** (18 replacements):

| Line(s) | Current | Fix |
|---|---|---|
| 281 | `confidence >= 0.8` | `confidence >= ESCALATION_THRESHOLDS.medical_emergency_min` |
| 286 | `confidence < 0.6` | `confidence < ESCALATION_THRESHOLDS.priority_queue_max` |
| 287 | `confidence < 0.4` | `confidence < ESCALATION_THRESHOLDS.human_handoff_max` |
| 428 | `confidence: 0.9` | `confidence: RULE_CONFIDENCE_VALUES.urgencia_medical` |
| 437 | `confidence: 0.85` | `confidence: RULE_CONFIDENCE_VALUES.reminder_rule` |
| 440 | `confidence: 0.85` | `confidence: RULE_CONFIDENCE_VALUES.reminder_rule` |
| 443 | `confidence: 0.85` | `confidence: RULE_CONFIDENCE_VALUES.reminder_rule` |
| 458 | `confidence: 0.8` | `confidence: RULE_CONFIDENCE_VALUES.reschedule_rule` |
| 465 | `confidence: 0.7` | `confidence: RULE_CONFIDENCE_VALUES.availability_rule` |
| 471 | `confidence: 0.8` | `confidence: RULE_CONFIDENCE_VALUES.cancel_rule` |
| 488 | `confidence: 0.1` | `confidence: RULE_CONFIDENCE_VALUES.desconocido` |
| 531 | `>= 0.4` | `>= ESCALATION_THRESHOLDS.tfidf_minimum` |
| 647 | `confidence: 0.95` | `confidence: SOCIAL_CONFIDENCE_VALUES.greeting_exact` |
| 648 | `confidence: 0.9` | `confidence: SOCIAL_CONFIDENCE_VALUES.greeting_phrase` |
| 649 | `confidence: 0.95` | `confidence: SOCIAL_CONFIDENCE_VALUES.farewell_exact` |
| 650 | `confidence: 0.9` | `confidence: SOCIAL_CONFIDENCE_VALUES.farewell_phrase` |
| 651 | `confidence: 0.95` | `confidence: SOCIAL_CONFIDENCE_VALUES.thank_you` |
| 652 | `confidence: 0.85` | `confidence: SOCIAL_CONFIDENCE_VALUES.off_topic` |

**Step 3 — `f/internal/ai_agent/types.ts`** — Keep lines 236/241 (`>= 0.85`, `>= 0.60 && < 0.85`) as-is. These implement AGENTS.md §5.1 system invariants. Add reference comments:

```typescript
// AGENTS.md §5.1 — Direct routing threshold (system-wide invariant)
export function isHighConfidence(confidence: number): boolean {
  return confidence >= 0.85;
}

// AGENTS.md §5.1 — Confirmation prompt threshold (system-wide invariant)
export function isMediumConfidence(confidence: number): boolean {
  return confidence >= 0.60 && confidence < 0.85;
}
```

**Step 4 — `f/internal/ai_agent/prompt-builder.ts`** — NO CHANGES. LLM prompt examples stay as literal numbers.

### Verification
```bash
grep -nP 'confidence[^"]*[><]=?\s*0\.\d+|confidence:\s*0\.\d+' f/internal/ai_agent/main.ts | grep -v '//'
# 0 matches expected

npx vitest run f/internal/ai_agent/
```

---

## PHASE 3 — HIGH-001: `as` Cast Elimination (Audit-Cited Files Only)

**Severity:** HIGH | **Files:** 5 cited | **Risk:** Medium | **Community alignment:** 80%

### Audit Citations — Architect Verification

| # | File:Line | Audit Claim | Verification | Action |
|---|---|---|---|---|
| 1 | `telegram_gateway/main.ts:9` | `z.any()` used | **FALSE POSITIVE** — only in pre-flight comment. Zod schema uses `.unknown()`. | **No change** |
| 2 | `gcal_reconcile/main.ts:99` | `data as Record<PropertyKey, unknown>` | **CONFIRMED** but community-endorsed — TypeScript-ESLint permits broadening `unknown` to `Record` when followed by runtime `typeof` checks. | **Keep with documented exception** |
| 3 | `web_waitlist/main.ts:255` | `txData as WaitlistResult` | **CONFIRMED** — transaction return type gap. | **Fix with Zod `.safeParse()`** |
| 4 | `web_admin_provider_crud/main.ts:376` | `as unknown as Record<string, unknown>` | **CONFIRMED** — double cast = type mismatch. | **Fix with discriminated interface** |
| 5 | `provider_manage/main.ts:258` | `txData as Readonly<Record<string, unknown>>` | **CONFIRMED** — same pattern as #3. | **Fix with Zod `.safeParse()`** |

### Total Scope

221 `as Type` casts exist across `f/`. This phase targets only the 5 audit-cited. Full elimination is a separate refactoring.

### Community-Validated Approach

**TypeScript-ESLint `no-unsafe-type-assertion`** (Tier 1):
- **Permitted:** Broadening types (narrowing `unknown` → `Record<string, unknown>`)
- **Forbidden:** Narrowing without validation (`value as SpecificType` when `value` is `unknown`)
- **Recommended:** Type guards, Zod validation, discriminated unions

**thoughtbot "Safe Dynamic Object Access"** (Tier 2):
- Use intermediate `const` variable + explicit `undefined` check for dynamic property access
- Do NOT use `as` casts where intermediate narrowing suffices

**Zod ecosystem consensus** (SuperJSON 2025, CodeMiner42 2025):
- For external/unknown data, Zod `.safeParse()` is the preferred pattern over custom type guards

### Fix Details

**3A — `f/gcal_reconcile/main.ts:99`** — KEEP with exception comment

```typescript
// EXCEPTION: Broadening unknown → Record for dynamic key access after typeof guard.
// Permitted by TypeScript-ESLint no-unsafe-type-assertion (broadening, not narrowing).
// Followed by runtime typeof check: typeof id === 'string'
const record = data as Record<string, unknown>;
```

**3B — `f/web_waitlist/main.ts:255`** — Zod schema validation

Define schema for the transaction result:

```typescript
const WaitlistResultSchema = z.object({
  id: z.uuid().optional(),
  email: z.string().email().optional(),
  // ... other fields matching WaitlistResult
});

// Replace: return [null, txData as WaitlistResult];
const parsed = WaitlistResultSchema.safeParse(txData);
if (!parsed.success) {
  return [new Error(`unexpected_transaction_shape: ${parsed.error.message}`), null];
}
return [null, parsed.data];
```

**3C — `f/provider_manage/main.ts:258`** — Zod schema validation

Same pattern as 3B. Define `ProviderManageResultSchema` and use `.safeParse()`.

**3D — `f/web_admin_provider_crud/main.ts:376`** — Discriminated interface

Replace double cast with explicit discriminated return type:

```typescript
interface ProviderListResult {
  readonly providers: readonly unknown[];
  readonly action: 'list';
}

interface ProviderCreateResult {
  readonly provider_id: string;
  readonly action: 'create';
}

type ProviderCrudResult = ProviderListResult | ProviderCreateResult;

// Function returns ProviderCrudResult — no cast needed
// Switch branches return concrete subtypes directly
```

### Verification
```bash
grep -n " as unknown\| as Record" f/web_waitlist/main.ts f/provider_manage/main.ts f/web_admin_provider_crud/main.ts
# 0 matches expected (gcal_reconcile exception is as Record — permitted)

npx tsc --noEmit
```

---

## PHASE 4 — CRITICAL-003: NULL_TENANT_UUID Elimination

**Severity:** CRITICAL | **Files:** 15 | **Risk:** HIGH — changes RLS behavior | **Community alignment:** 75%

### Operator Directive — Overrides Community Consensus

The operator has explicitly mandated the following architecture for NULL_TENANT_UUID remediation:

1. **ELIMINATE the sentinel constant** — `NULL_TENANT_UUID` must be removed entirely.
2. **Tenant ID flows ONLY through `withTenantContext`** — if tenant is null/undefined, return `[Error, null]` before touching the database.
3. **Background jobs MUST iterate tenants** — NOT use `BYPASSRLS`. Query distinct `provider_id` values → loop → `withTenantContext(tenantId, ...)` per tenant.
4. **RLS must reject null/sentinel values** — policy conditions must not allow `NULL` or sentinel UUIDs for `app.current_tenant_id`.

This overrides the community recommendation (OneUptime, wellally) to use `BYPASSRLS` for background jobs. The operator's iteration pattern is the mandated approach.

### Full Inventory

| # | File | Usage | Risk | Fix Strategy (Operator-Mandated) |
|---|---|---|---|---|
| 1 | `health_check/main.ts:65` | Connectivity probe | LOW | `pool.query('SELECT 1')` direct — no tenant context needed. Health check is not a tenant-scoped operation. |
| 2 | `circuit_breaker/main.ts:154` | System-global state | LOW | Table without `provider_id` column. No `withTenantContext` needed. System state table. |
| 3 | `telegram_auto_register/main.ts:96` | System script | MEDIUM | **Iterate tenants**: Query `SELECT DISTINCT provider_id FROM providers WHERE is_active = true` → loop → `withTenantContext(tenantId, ...)` per tenant. |
| 4 | `admin_honorifics/main.ts:195` | Global honorifics | MEDIUM | Move to `global_honorifics` table without `provider_id`. RLS policy: `SELECT` for all authenticated users. No tenant context needed for global data. |
| 5 | `web_admin_specialties_crud/main.ts:175` | Global specialties | MEDIUM | Same as #4. Specialties are global catalog, not tenant-scoped. |
| 6 | `provider_manage/main.ts:98` | Admin provider ops | MEDIUM | Require explicit `provider_id` in input Zod schema. Reject with `[Error, null]` if missing. Admin tools MUST target specific provider. |
| 7 | `provider_dashboard/main.ts:86,92` | Admin listing fallback | MEDIUM | Same as #6. Require explicit `provider_id`. No fallback. |
| 8 | `dlq_processor/main.ts:146` | Dead letter processing | HIGH | **Iterate tenants**: Query `SELECT DISTINCT provider_id FROM bookings WHERE gcal_sync_status IN ('pending','failed')` → loop → `withTenantContext(tenantId, ...)` per tenant. |
| 9 | `web_auth_login/main.ts:104` | Web auth | HIGH | Derive tenant from auth context (subdomain, form field, or JWT claim). Validate with Zod. If null → `[Error, null]` before DB. |
| 10 | `web_auth_register/main.ts:140` | Web auth | HIGH | Same as #9. Tenant must come from explicit input, never sentinel. |
| 11 | `web_auth_complete_profile/main.ts:146` | Web auth | HIGH | Same as #9. |
| 12 | `config/index.ts:153` | Definition | N/A | **DELETE** the constant. No deprecation period. All callers must be fixed before this is removed. |

### Execution Order

```
4A: health_check              (LOW — direct query, no tenant)
4B: circuit_breaker           (LOW — global table, no tenant)
4C: admin_honorifics          (MEDIUM — global table + RLS policy)
4D: web_admin_specialties     (MEDIUM — same)
4E: provider_manage           (MEDIUM — explicit provider_id required)
4F: provider_dashboard        (MEDIUM — same)
4G: telegram_auto_register    (MEDIUM — iterate tenants)
4H: dlq_processor             (HIGH — iterate tenants)
4I: web_auth_login            (HIGH — derive from auth context)
4J: web_auth_register         (HIGH — same)
4K: web_auth_complete_profile (HIGH — same)
4L: DELETE NULL_TENANT_UUID constant from config/index.ts
```

### Tenant Iteration Pattern (Mandated for Background Jobs)

```typescript
// Example: dlq_processor
const [tenantErr, tenants] = await getActiveTenants();
if (tenantErr !== null) return [tenantErr, null];

const results: readonly [string, Result<unknown>][] = await Promise.all(
  tenants.map(async (tenantId: string) => {
    const [err, result] = await withTenantContext(client, tenantId, async (tx) => {
      // Process DLQ items for this tenant
    });
    return [tenantId, [err, result]] as const;
  }),
);

// Report failures per tenant
const failures = results.filter(([, [err]]) => err !== null);
if (failures.length > 0) {
  console.error('DLQ processing failed for tenants:', failures.map(([id]) => id));
}
```

### RLS Policy Enforcement (Mandated for Migrations)

```sql
-- RLS policy must NOT allow NULL or sentinel values
CREATE POLICY tenant_isolation ON bookings
  USING (provider_id = current_setting('app.current_tenant', true)::uuid);

-- Ensure the session variable cannot be NULL or empty
-- The ::uuid cast already rejects invalid UUIDs (including empty string)
-- withTenantContext validates UUID format before SET LOCAL
```

**⚠️ Warning:** This is the most critical phase. Every `NULL_TENANT_UUID` call site changes RLS behavior. Background jobs that previously bypassed tenant isolation will now enforce it per-tenant. Admin workflows that relied on fallback behavior will fail explicitly.

**Requires operator approval before starting.** Each fix changes RLS behavior.

### Verification
```bash
grep -rn "NULL_TENANT_UUID" f/
# 0 matches expected (except deprecated definition in config/index.ts)

# Verify BYPASSRLS role is used by background jobs
grep -rn "app_service\|BYPASSRLS" f/dlq_processor/main.ts f/telegram_auto_register/main.ts
# Both should reference app_service role, not NULL_TENANT_UUID
```

---

## EXECUTION CHECKLIST

After each phase:

```bash
npx tsc --noEmit
npx vitest run --run

# Phase-specific grep:
grep -n '"greeting"' f/internal/cache/index.test.ts              # Phase 1: 0 matches
grep -cP 'confidence:\s*0\.\d+|confidence[><]=\s*0\.\d+' f/internal/ai_agent/main.ts  # Phase 2: 0 matches
grep -n " as unknown" f/web_waitlist/main.ts f/provider_manage/main.ts f/web_admin_provider_crud/main.ts  # Phase 3: 0 matches
grep -rn "NULL_TENANT_UUID" f/                                    # Phase 4: 0 matches (except deprecated definition)
```

---

## RISK ASSESSMENT

| Phase | Risk | Rollback | User Impact | Community Confidence |
|---|---|---|---|---|
| 1 — cache intent | None | Revert 4 lines | Zero | 100% |
| 2 — confidence constants | Low | Revert constant extraction | Zero (behavior identical) | 95% |
| 3 — `as` casts | Medium | Revert per-file | Zero if Zod schemas correct | 85% |
| 4 — NULL_TENANT | **HIGH** | Full git revert | May break admin UI if tenant derivation wrong; background jobs require tenant iteration refactor | **Operator-mandated** (overrides community) |

---

## RECOMMENDED NEXT STEP

**Execute Phase 1.** Safest, fastest, most clearly correct. One production file type fix + one test file string replacement. Zero risk.
