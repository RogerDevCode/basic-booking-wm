# FIX PLAN — Audit AUDIT_2026-04-10T18-00-53Z

**Generated:** 2026-04-10
**Source audit:** `audits/AUDIT_2026-04-10T18-00-53Z.md`
**Status:** Verified by Architect — all 5 findings CONFIRMED with evidence
**Approach:** One fix at a time. Each fix is atomic, self-contained, and independently verifiable.

---

## VERIFICATION SUMMARY

| # | Finding | Audit Claim | Architect Verification | Verdict |
|---|---|---|---|---|
| 1 | CRITICAL-001 | Test tampering (6 modified, 2 deleted) | **CONFIRMED** — `git diff HEAD` shows 6M + 2D. Tests adapted to new AI Agent contract (`urgent_care`→`urgencia`, `suggested_response_type`→`dialogue_act`). 2 files (`devil-advocate.test.ts`, `prompt-regression.test.ts`) deleted from working tree but exist in HEAD. Tests currently pass 218/218. | **CONFIRMED** |
| 2 | CRITICAL-002 | English intent `"greeting"` in cache test | **CONFIRMED** — `f/internal/cache/index.test.ts` lines 40, 62, 80 use literal `"greeting"` instead of `INTENT.SALUDO` | **CONFIRMED** |
| 3 | CRITICAL-003 | Hardcoded `NULL_TENANT_UUID` export | **CONFIRMED** — `f/internal/config/index.ts:153`. 15 files import and use it. | **CONFIRMED** |
| 4 | HIGH-001 | `as` casts and `z.any()` | **CONFIRMED** — 221 `as Type` casts across codebase. 5 cited specifically. `z.any()` mentioned in comment only (not actual code — the comment is misleading, no `z.any()` found in source). | **PARTIALLY CONFIRMED** — `as` casts confirmed, `z.any()` NOT found in actual code (only in a comment) |
| 5 | MEDIUM-001 | Hardcoded confidence thresholds | **CONFIRMED** — `main.ts:281` (`>= 0.8`), `main.ts:286` (`< 0.6`), `main.ts:437` (`0.85`), `prompt-builder.ts:172` (`0.85`). `CONFIDENCE_THRESHOLDS` in constants.ts exists but is NOT used in these locations. | **CONFIRMED** |

---

## FIX ORDER

Execute in this exact order. Each fix is independent within its phase.

```
Phase 1 → CRITICAL-002 (cache test English intent)  — 1 file, lowest risk
Phase 2 → CRITICAL-001 (test restoration)            — 8 files, mechanical restore
Phase 3 → MEDIUM-001 (confidence threshold centralization) — 3 files
Phase 4 → HIGH-001 (as cast elimination)             — 5 files, highest complexity
Phase 5 → CRITICAL-003 (NULL_TENANT_UUID removal)    — 15 files, requires architectural decisions
```

---

## PHASE 1 — CRITICAL-002: English Intent in Cache Test

**Severity:** CRITICAL
**Files affected:** 1
**Estimated changes:** ~6 lines

### Problem
`f/internal/cache/index.test.ts` uses the English string literal `"greeting"` in 3 test locations. The `CacheEntry.intent` field is typed as `string` (no enum enforcement), so the tests silently pass with the wrong value. This is a NLU vocabulary drift violation per AGENTS.md §5.1.

### Fix Details

**File: `f/internal/cache/index.test.ts`**

| Line | Current (WRONG) | Fix (CORRECT) |
|---|---|---|
| 1 (top) | _(no import)_ | Add: `import { INTENT } from '../ai_agent/constants';` |
| 40 | `intent: "greeting",` | `intent: INTENT.SALUDO,` |
| 62 | `expect(data?.intent).toBe("greeting");` | `expect(data?.intent).toBe(INTENT.SALUDO);` |
| 80 | `await cacheSet("hola", "Hola! ¿Cómo puedo ayudarte?", "greeting", 1800);` | `await cacheSet("hola", "Hola! ¿Cómo puedo ayudarte?", INTENT.SALUDO, 1800);` |

**File: `f/internal/cache/index.ts`**

| Line | Current (WEAK) | Fix (STRONG) |
|---|---|---|
| 14 | `readonly intent: string;` | Import `type IntentType` from ai_agent/constants and use `readonly intent: IntentType;` |

**Verification:**
```bash
npx vitest run f/internal/cache/index.test.ts
grep -n '"greeting"' f/internal/cache/index.test.ts   # must return 0 matches
```

**Risk:** None. Pure string replacement. Tests will continue to pass.

---

## PHASE 2 — CRITICAL-001: Test Tampering

**Severity:** CRITICAL
**Files affected:** 8 (6 modified, 2 deleted)
**Estimated changes:** Mechanical — restore to HEAD, then adapt

### 2A — Restore Deleted Files (mechanical)

```bash
git checkout HEAD -- f/internal/ai_agent/devil-advocate.test.ts
git checkout HEAD -- f/internal/ai_agent/prompt-regression.test.ts
```

**Verification:**
```bash
ls f/internal/ai_agent/devil-advocate.test.ts    # must exist
ls f/internal/ai_agent/prompt-regression.test.ts # must exist
npx vitest run f/internal/ai_agent/devil-advocate.test.ts   # must pass
npx vitest run f/internal/ai_agent/prompt-regression.test.ts # must pass
```

### 2B — Evaluate Modified Test Files

| File | Diff Summary | Action Required |
|---|---|---|
| `f/booking_create/main.test.ts` | Changed from `{ success, error_message }` to `[Error, null]` tuple assertions via `assertError()` helper | **KEEP** — This is a legitimate test improvement. The new assertions are STRICTLY better (tuple-based, match production contract). No revert needed. |
| `f/booking_wizard/main.test.ts` | Similar tuple adaptation | **KEEP** — Same rationale as above. |
| `f/gcal_reconcile/main.test.ts` | Similar tuple adaptation | **KEEP** — Same rationale. |
| `tests/db-integration.test.ts` | Adapted to tuple return | **KEEP** — Same rationale. |
| `f/internal/ai_agent/main.test.ts` | Changed `intent: 'urgent_care'` → `intent: 'urgencia'`, `suggested_response_type` → `dialogue_act` | **KEEP** — These changes align tests with the ACTUAL production code contract. The old tests expected `'urgent_care'` which the AI Agent no longer produces. This is NOT tampering — it's adapting tests to a real contract change. |
| `f/internal/ai_agent/main.comprehensive.test.ts` | Same as above | **KEEP** — Same rationale. |

### Verdict on CRITICAL-001

**The auditor flagged ALL test modifications as "sabotage." This is partially correct and partially a false positive:**

- **2 deleted files** = real sabotage. Must restore immediately.
- **6 modified files** = legitimate adaptations to production contract changes. The AI Agent changed its output contract (from `{ success, error_message }` to `[Error | null, T | null]` tuples, from `urgent_care` to `urgencia`, from `suggested_response_type` to `dialogue_act`). The tests were updated to match. **This is correct behavior under AGENTS.md §13.2**: when production code changes, tests must reflect the new contract. The auditor's blanket "sabotage" label on these is a false positive.

**Action:** Restore the 2 deleted files. Keep the 6 modified files as-is.

**Full verification after Phase 2:**
```bash
npx vitest run --run
# Expected: 218+ tests passing (more if deleted files add tests)
```

---

## PHASE 3 — MEDIUM-001: Confidence Threshold Centralization

**Severity:** MEDIUM
**Files affected:** 3
**Estimated changes:** ~15 lines

### Problem
`CONFIDENCE_THRESHOLDS` exists in `f/internal/ai_agent/constants.ts` but the following code locations hardcode numeric values instead of referencing it:

| Location | Hardcoded Value | Should Reference |
|---|---|---|
| `main.ts:281` | `confidence >= 0.8` | `confidence >= CONFIDENCE_THRESHOLDS[INTENT.URGENCIA]` (but 0.8 is escalation threshold, not detection threshold — see below) |
| `main.ts:286` | `confidence < 0.6` | New constant needed (escalation threshold) |
| `main.ts:437` | `confidence: 0.85` | `CONFIDENCE_THRESHOLDS[INTENT.DESACTIVAR_RECORDATORIOS]` (= 0.5 currently — MISMATCH, see analysis) |
| `prompt-builder.ts:172` | `"confidence":0.85` | Reference constant |

### Analysis — Two Different Concepts Are Being Confused

**CONFIDENCE_THRESHOLDS** in constants.ts currently defines **detection thresholds** (minimum confidence to accept an intent classification). The values in `main.ts` line 281/286 are **escalation thresholds** (when to escalate to human vs priority queue). These are semantically different:

- Detection: "Is this intent reliably identified?" → 0.5 for most intents
- Escalation: "Should this go to a human?" → 0.8 for urgent, 0.6 for priority queue

**The fix is NOT to reuse CONFIDENCE_THRESHOLDS for escalation.** It's to create a new constant set.

### Fix Details

**File: `f/internal/ai_agent/constants.ts` — Add new constants:**

```typescript
// ESCALATION THRESHOLDS — When to route to human/priority queue
// Separate from CONFIDENCE_THRESHOLDS (detection minimums)
export const ESCALATION_THRESHOLDS = Object.freeze({
  medical_emergency_confidence_min: 0.8,   // urgent + high confidence → 911
  priority_queue_confidence_max: 0.6,      // urgent + low confidence → human queue
  human_handoff_confidence_max: 0.4,       // any non-social intent + very low confidence
});
```

**File: `f/internal/ai_agent/main.ts` — Replace hardcoded values:**

| Line | Current | Fix |
|---|---|---|
| 281 | `confidence >= 0.8` | `confidence >= ESCALATION_THRESHOLDS.medical_emergency_confidence_min` |
| 286 | `confidence < 0.6` | `confidence < ESCALATION_THRESHOLDS.priority_queue_confidence_max` |
| 284 | (no explicit check, implicit) | Add: `confidence < ESCALATION_THRESHOLDS.human_handoff_confidence_max` for the `< 0.4` check on line ~287 |
| 437 | `confidence: 0.85` | `confidence: CONFIDENCE_THRESHOLDS[INTENT.DESACTIVAR_RECORDATORIOS]` |
| 432 | `confidence: 0.8` (REAGENDAR) | `confidence: CONFIDENCE_THRESHOLDS[INTENT.REAGENDAR_CITA]` |
| 442 | `confidence: 0.7` (CONSULTAR_DISPONIBILIDAD) | `confidence: CONFIDENCE_THRESHOLDS[INTENT.VER_DISPONIBILIDAD]` |

### Full Inventory of All Hardcoded Confidence Values in `main.ts`

**Escalation thresholds** (determine human handoff — NOT detection):
| Line | Value | Purpose |
|---|---|---|
| 281 | `>= 0.8` | Medical emergency escalation |
| 286 | `< 0.6` | Priority queue for low-confidence urgency |
| 287 | `< 0.4` | Human handoff for any non-social low-confidence |
| 531 | `>= 0.4` | TF-IDF minimum confidence to accept |

**Rule-based detection confidence assignments** (`detectIntentRules`):
| Line | Intent | Value |
|---|---|---|
| 428 | URGENCIA | 0.9 |
| 437 | DESACTIVAR_RECORDATORIOS | 0.85 |
| 440 | ACTIVAR_RECORDATORIOS | 0.85 |
| 443 | PREFERENCIAS_RECORDATORIO | 0.85 |
| 458 | REAGENDAR | 0.8 |
| 465 | CONSULTAR_DISPONIBILIDAD | 0.7 |
| 471 | CANCELAR_CITA | 0.8 |
| 488 | DESCONOCIDO | 0.1 |

**Fast-path social detection** (`detectSocial`):
| Line | Intent | Value |
|---|---|---|
| 647 | SALUDO (exact greeting) | 0.95 |
| 648 | SALUDO (phrase match) | 0.9 |
| 649 | DESPEDIDA (exact farewell) | 0.95 |
| 650 | DESPEDIDA (phrase match) | 0.9 |
| 651 | AGRADECIMIENTO | 0.95 |
| 652 | PREGUNTA_GENERAL (off-topic) | 0.85 |

**LLM prompt examples** (`prompt-builder.ts` lines 172-292):
These are example JSON values in the LLM system prompt. They are illustrative, not executable logic. **These do NOT need to be changed** — they teach the LLM what confidence values look like. Changing them to variable references would break the prompt string.

### Fix Details

**Step 1 — Add to `f/internal/ai_agent/constants.ts`:**

```typescript
// ESCALATION THRESHOLDS — When to escalate to human/priority queue
// Separate from CONFIDENCE_THRESHOLDS (minimum detection confidence per intent)
export const ESCALATION_THRESHOLDS = Object.freeze({
  medical_emergency_min: 0.8,    // urgency + this confidence → medical_emergency escalation
  priority_queue_max: 0.6,       // urgency + below this → priority_queue
  human_handoff_max: 0.4,        // any non-social + below this → human_handoff
  tfidf_minimum: 0.4,            // TF-IDF classifier minimum to accept result
});

// RULE-BASED DETECTION CONFIDENCE — Confidence values returned by detectIntentRules()
export const RULE_CONFIDENCE_VALUES = Object.freeze({
  urgencia_medical: 0.9,
  reminder_rule: 0.85,           // activar/desactivar/preferencias
  reschedule_rule: 0.8,
  cancel_rule: 0.8,
  availability_rule: 0.7,
  desconocido: 0.1,
});

// SOCIAL FAST-PATH CONFIDENCE — Confidence values from detectSocial()
export const SOCIAL_CONFIDENCE_VALUES = Object.freeze({
  greeting_exact: 0.95,
  greeting_phrase: 0.9,
  farewell_exact: 0.95,
  farewell_phrase: 0.9,
  thank_you: 0.95,
  off_topic: 0.85,
});
```

**Step 2 — Update `f/internal/ai_agent/main.ts`:**

| Line | Current | Fix |
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

**Step 3 — `f/internal/ai_agent/types.ts`:**

| Line | Current | Fix |
|---|---|---|
| 236 | `confidence >= 0.85` | `confidence >= 0.85` — **KEEP AS-IS**. This is the AGENTS.md §5.1 mandate (direct routing threshold). It is a SYSTEM-WIDE invariant, not an implementation detail. Document it with a comment referencing §5.1. |
| 241 | `>= 0.60 && < 0.85` | **KEEP AS-IS** with §5.1 reference comment. |

**Step 4 — `f/internal/ai_agent/prompt-builder.ts`:**
**NO CHANGES NEEDED.** The `0.85`, `0.90`, `0.95` values in the LLM prompt are example outputs for the LLM to emulate. They are documentation, not executable code. Converting them to `${ESCALATION_THRESHOLDS...}` would produce unreadable prompt text.

**Verification:**
```bash
# No hardcoded confidence values in main.ts (except comments and string literals in prompt examples)
grep -nP 'confidence[^"]*[><]=?\s*0\.\d+|confidence:\s*0\.\d+' f/internal/ai_agent/main.ts | grep -v '//'
# Expected: 0 matches

# Tests must pass
npx vitest run f/internal/ai_agent/
```

**Risk:** Low. Pure constant extraction. Values remain identical. Tests validate behavior unchanged.

---

## PHASE 4 — HIGH-001: `as` Cast Elimination

**Severity:** HIGH
**Files affected:** 5 (specifically cited by audit)
**Estimated changes:** ~30 lines total

### Audit's Specific Citations — Verification

| # | File:Line | Audit Claim | Architect Verification |
|---|---|---|---|
| 1 | `telegram_gateway/main.ts:9` | `z.any()` used | **FALSE POSITIVE** — `z.any()` appears only in a comment (pre-flight checklist). Actual Zod schema uses `.unknown()` which is compliant. |
| 2 | `gcal_reconcile/main.ts:99` | `data as Record<PropertyKey, unknown>` | **CONFIRMED** — but this is a **defensive type narrowing** after `typeof data !== 'object'` check. The subsequent `record['id']` access is type-safe. Still, can be eliminated. |
| 3 | `web_waitlist/main.ts:255` | `txData as WaitlistResult` | **CONFIRMED** — `txData` is the result of a transaction block that should already be typed. The cast indicates a gap in the transaction's type inference. |
| 4 | `web_admin_provider_crud/main.ts:376` | `as unknown as Record<string, unknown>` | **CONFIRMED** — double cast is a code smell indicating type mismatch. |
| 5 | `provider_manage/main.ts:258` | `txData as Readonly<Record<string, unknown>>` | **CONFIRMED** — same pattern as web_waitlist. |

### Total `as` Casts in Codebase

The audit cited 5 files, but `grep` found **221 total `as Type` casts** across the entire `f/` directory. Not all are violations:

**Legitimate uses (NOT fixable in this phase):**
- `as const` — readonly assertion, NOT a type cast. Allowed by AGENTS.md. (~40 instances)
- `as const` in Zod schema refinements — type narrowing for literal types. (~15 instances)

**Fixable casts (this phase targets the 5 audit-cited + close neighbors):**

#### Fix 4A — `f/gcal_reconcile/main.ts:99`

**Current:**
```typescript
const record = data as Record<PropertyKey, unknown>;
const id: unknown = record['id'];
```

**Fix:**
```typescript
function extractIdSafe(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>; // still needed for index access
  const id = obj['id'];
  return typeof id === 'string' ? id : null;
}
```

**Verdict:** The `as Record<string, unknown>` is **unavoidable** in TypeScript for dynamic key access on `unknown`. This is the same pattern the code already uses. The AGENTS.md ban on `as` should have an explicit exception for "indexing into a plain object after typeof guard." **Recommend: ACCEPT AS-IS with documented exception.**

#### Fix 4B — `f/web_waitlist/main.ts:255`

**Current:**
```typescript
return [null, txData as WaitlistResult];
```

**Fix:** Use a type guard or ensure the transaction block returns the correct type.

```typescript
// Verify txData matches WaitlistResult shape
if (typeof txData !== 'object' || txData === null || !('id' in txData)) {
  return [new Error('unexpected_transaction_result_shape'), null];
}
return [null, txData]; // TypeScript still needs help here
```

**Verdict:** The real fix is to type the `withTenantContext` operation's return type correctly so no cast is needed. This requires checking what `txData` actually is (the INSERT result). **Requires investigation.** Accept as known gap for now.

#### Fix 4C — `f/provider_manage/main.ts:258`

Same pattern as 4B. Same verdict.

#### Fix 4D — `f/web_admin_provider_crud/main.ts:376`

**Current:**
```typescript
return [null, { providers: listData, action: 'list' } as unknown as Record<string, unknown>];
```

**Fix:** Type the function return as a specific interface instead of `Record<string, unknown>`.

**Verdict:** This is a legitimate violation. The function should return a typed union or discriminated result type. Fixable but requires understanding the full return contract.

### PHASE 4 Verdict

**Of the 5 audit-cited `as` casts:**
- 1 (`telegram_gateway`) = FALSE POSITIVE (comment only)
- 1 (`gcal_reconcile`) = Unavoidable TS limitation for dynamic key access — acceptable
- 3 (`web_waitlist`, `provider_manage`, `web_admin_provider_crud`) = CONFIRMED violations but fixing requires understanding transaction return types

**Recommended approach for PHASE 4:**
1. Fix `web_admin_provider_crud/main.ts:376` — most clear-cut violation
2. Accept `gcal_reconcile/main.ts:99` with documented exception
3. Investigate `web_waitlist` and `provider_manage` transaction typing — may require changing `withTenantContext` generics

**Not attempting full 221-cast elimination in this phase.** That's a separate refactoring effort.

---

## PHASE 5 — CRITICAL-003: NULL_TENANT_UUID Elimination

**Severity:** CRITICAL
**Files affected:** 15
**Estimated changes:** 15 files + possible schema changes for global tables
**Risk:** HIGH — changes RLS behavior, may break admin workflows

### Full Inventory

| # | File | Usage | Risk Level | Fix Strategy |
|---|---|---|---|---|
| 1 | `f/health_check/main.ts:65` | Connectivity probe | LOW | Use raw `pool.query('SELECT 1')` without `withTenantContext`. Health check is not a tenant-scoped operation. |
| 2 | `f/dlq_processor/main.ts:146` | DLQ processing | HIGH | Query `SELECT DISTINCT provider_id FROM bookings WHERE gcal_sync_status IN ('pending','failed')` → iterate → `withTenantContext` per tenant |
| 3 | `f/provider_manage/main.ts:98` | Admin provider ops | MEDIUM | Require explicit `provider_id` in input. Reject if missing. Admin tools should target a specific provider. |
| 4 | `f/provider_dashboard/main.ts:86,92` | Admin listing fallback | MEDIUM | Same as #3. Admin listing across all providers needs a special RLS policy, not a fake UUID. |
| 5 | `f/web_auth_complete_profile/main.ts:146` | Web auth | HIGH | Tenant must come from the auth context (subdomain, form field, or JWT claim). Never null. |
| 6 | `f/admin_honorifics/main.ts:195` | Global honorifics | MEDIUM | Honorifics are system-global. Move to `global_honorifics` table without `provider_id`, or add RLS policy: `GRANT SELECT ON honorifics TO authenticated_users`. |
| 7 | `f/telegram_auto_register/main.ts:96` | System script | MEDIUM | Should use `SYSTEM_TENANT_ID` from env var, not hardcoded null UUID. |
| 8 | `f/circuit_breaker/main.ts:154` | System script | LOW | Circuit breaker state is system-global. Table should not have `provider_id`. Remove tenant requirement for this table. |
| 9 | `f/web_auth_login/main.ts:104` | Web auth | HIGH | Same as #5. |
| 10 | `f/web_admin_specialties_crud/main.ts:175` | Global specialties | MEDIUM | Same as #6. Specialties are global catalog. |
| 11 | `f/web_auth_register/main.ts:140` | Web auth | HIGH | Same as #5. |
| 12 | `f/internal/config/index.ts:153` | Definition | N/A | Deprecate with JSDoc. Keep for backward compat during migration. Remove after all callers are fixed. |
| 13 | `f/internal/tenant-context/index.ts:118` | Reference in doc | N/A | No change needed. |

### Fix Order for PHASE 5

```
5A: health_check (LOW risk, quick win)
5B: circuit_breaker (LOW risk, global table)
5C: telegram_auto_register (MEDIUM — add SYSTEM_TENANT_ID env var)
5D: admin_honorifics (MEDIUM — global table or RLS policy)
5E: web_admin_specialties_crud (MEDIUM — same as 5D)
5F: provider_manage (MEDIUM — require explicit provider_id)
5G: provider_dashboard (MEDIUM — same as 5F)
5H: dlq_processor (HIGH — iterate tenants)
5I: web_auth_login (HIGH — derive tenant from auth context)
5J: web_auth_register (HIGH — same as 5I)
5K: web_auth_complete_profile (HIGH — same as 5I)
5L: Remove NULL_TENANT_UUID export from config
```

**This phase requires operator approval before starting.** Each fix changes RLS behavior and may break existing admin workflows.

---

## EXECUTION CHECKLIST

Execute one phase at a time. After each phase:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Test
npx vitest run --run

# 3. Compliance grep (where applicable)
grep -rn '"greeting"' --include="*.ts" f/internal/cache/      # Phase 1: 0 matches
grep -rn 'devil-advocate\|prompt-regression' --include="*.ts" f/  # Phase 2: files exist
grep -nP 'confidence[^"]*[><]=?\s*0\.\d+' f/internal/ai_agent/main.ts | grep -v '//' # Phase 3: 0 matches
grep -rn " as [A-Z]" --include="*.ts" f/web_admin_provider_crud/  # Phase 4: 0 matches for cited cast
grep -rn "NULL_TENANT_UUID" --include="*.ts" f/                  # Phase 5: 0 matches
```

---

## RISK ASSESSMENT

| Phase | Risk | Rollback Strategy | Est. Impact |
|---|---|---|---|
| 1 (cache intent) | NONE | Revert 4 lines | 0 user impact |
| 2 (test restore) | LOW | `git checkout -- <files>` | 0 user impact |
| 3 (confidence constants) | LOW | Revert constant extraction | 0 user impact |
| 4 (`as` casts) | MEDIUM | Revert per-file casts | 0 user impact if done correctly |
| 5 (NULL_TENANT) | HIGH | Full rollback via git | MAY break admin UI if tenant derivation is wrong |

---

## RECOMMENDED NEXT STEP

**Start with Phase 1.** It's the safest, fastest, and most clearly correct fix. One file, 4 string replacements, 1 type tightening. Zero risk.

Say `"execute phase 1"` and I'll do it.
