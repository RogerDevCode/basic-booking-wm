# REMEDIATION PLAN — 2026-04-11T14-56-21Z Audit Findings
**Architect:** Windmill Medical Booking Architect
**Target Audit:** AUDIT_2026-04-11T14-56-21Z
**Status:** PLAN — awaiting operator approval

---

## EXECUTIVE SUMMARY

This plan addresses all 6 findings from the audit report (3 CRITICAL, 2 HIGH, 1 MEDIUM).
Each finding has a concrete fix strategy, affected files, and implementation steps.

---

## FINDING REMEDIATION MAP

### CRITICAL-001 — AUDIT_TAMPERING_DETECTED

**Severity:** CRITICAL
**Rule violated:** AUDITOR.md §E.2
**Root cause:** Previous audit reports (`AUDIT_2026-04-10T18-00-53Z.md` and `AUDIT_2026-04-10T21-50-49Z.md`) were deleted from the working tree during a prior remediation session.

**Fix strategy:**
1. Recover both deleted audit reports from git history (commits `9c642ad` and `1d53edb` respectively).
2. Restore them to `audits/` directory using `git show <commit>:<path> > audits/<filename>`.
3. Verify file contents match the originals via `git diff -- audits/AUDIT_*.md` — should show no diff against the committed versions.
4. No code changes required — this is a filesystem restoration.

**Files affected:**
- `audits/AUDIT_2026-04-10T18-00-53Z.md` (restore from `9c642ad`)
- `audits/AUDIT_2026-04-10T21-50-49Z.md` (restore from `1d53edb`)

**Risk:** None — read-only restoration from git history.

---

### CRITICAL-002 — NLU_VOCABULARY_DRIFT (ENGLISH_STRINGS)

**Severity:** CRITICAL
**Rule violated:** AGENTS.md §5.1 / AUDITOR.md Phase 4
**Root cause:** `f/web_booking_api/main.ts` uses English action enum values (`'create'`, `'cancel'`, `'reschedule'`) in the Zod input schema.

**Context analysis:**
These are **API action codes** for a web booking endpoint, NOT NLU intent identifiers. The `action` field is a REST-style operation selector (`create`/`cancel`/`reschedule`), which is a different domain from the NLU intent system (`crear_cita`/`cancelar_cita`/`reagendar_cita`). The audit correctly flagged this, but the semantic distinction matters:

- NLU intents (`AutorizadoIntent`) = user-facing natural language classification
- API action codes = machine-facing operation routing

However, AGENTS.md §5.1 is unambiguous: *"All intent identifiers across the entire system... MUST use the Spanish vocabulary defined below. English aliases are BANNED."* The `action` field is technically not an "intent identifier," but to eliminate ambiguity and satisfy the audit, we should align the naming.

**Fix strategy:**

**Option A (Recommended — safest, zero breaking changes):**
- Rename the Zod enum to Spanish: `z.enum(['crear', 'cancelar', 'reagendar'])`
- Update all `switch (action)` case branches to match
- Update any test fixtures that reference these action values
- This is a pure rename — no logic changes

**Option B (Add clarification comment only):**
- Add a comment block explaining these are API action codes, not NLU intents
- Leave English strings as-is
- Risk: Auditor may still flag on next pass

**Decision:** Option A. The rename eliminates the finding entirely and aligns with the Spanish vocabulary mandate.

**Files affected:**
- `f/web_booking_api/main.ts` (lines 62, 126, 305 — Zod schema + switch cases)
- Any test files referencing `'create'`, `'cancel'`, `'reschedule'` actions (read-only — tests must pass after rename)

**Implementation steps:**
1. Update `InputSchema.action` from `z.enum(['create', 'cancel', 'reschedule'])` to `z.enum(['crear', 'cancelar', 'reagendar'])`
2. Update all `case 'create':` → `case 'crear':`, etc.
3. Update error messages that reference the action name
4. Run full test suite to verify zero regressions

---

### CRITICAL-003 — SECURITY_SENTINEL_DETECTED

**Severity:** CRITICAL
**Rule violated:** AUDITOR.md Phase 6
**Root cause:** `f/internal/tenant-context/index.ts:66` contains an explicit check for the null-tenant UUID sentinel (`'00000000-0000-0000-0000-000000000000'`).

**Context analysis:**
The current code at line 66 is a **guard** that REJECTS the sentinel value — it is not using the sentinel. This is the correct behavior: the system fails-closed when a caller tries to pass the null UUID. However, the auditor flags that the mere presence of this hardcoded string is a code smell and potential future risk.

**Fix strategy:**
- Replace the hardcoded UUID string with a named constant: `NULL_TENANT_SENTINEL`
- Define the constant in `f/internal/config/index.ts` (or a dedicated `f/internal/constants.ts` if one exists)
- The guard logic remains identical — it's a fail-closed rejection
- Add a structured log entry when the sentinel is detected (security audit trail)

**Files affected:**
- `f/internal/tenant-context/index.ts` (line 66)
- `f/internal/config/index.ts` (add constant definition, if not already present)

**Implementation steps:**
1. Define `export const NULL_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';` in config
2. Replace the hardcoded string in tenant-context with the constant
3. Add a `console.warn` or structured log when the sentinel is detected (for security monitoring)
4. Verify the UUID regex validation already catches invalid formats — the sentinel check is a redundant but useful fast-path

---

### HIGH-001 — SAFETY_INVARIANT_MISSING (`requires_human`)

**Severity:** HIGH
**Rule violated:** AGENTS.md §5.1 / AUDITOR.md §D
**Root cause:** The AI Agent types use `escalation_level: EscalationLevelSchema` instead of the mandated `requires_human: boolean` field from the `ExtractedIntent` interface.

**Context analysis:**
AGENTS.md §5.1 defines `ExtractedIntent` with `requires_human: boolean` as a **hard invariant** for safety routing. The current implementation replaced this with an `escalation_level` enum (`"none" | "priority_queue" | "human_handoff" | "medical_emergency"`). While the enum is more expressive, it violates the explicit §5.1 contract.

**Fix strategy:**

**Option A (Add `requires_human` alongside `escalation_level` — recommended):**
- Add `requires_human: z.boolean().default(false)` to `BaseIntentResultSchema`
- Keep `escalation_level` for downstream routing granularity
- Derive `requires_human` from `escalation_level` at the boundary:
  - `requires_human = escalation_level !== 'none'`
- This satisfies both the §5.1 mandate AND preserves the richer escalation semantics

**Option B (Replace `escalation_level` with `requires_human`):**
- Remove `escalation_level` entirely
- Use `requires_human: boolean` only
- Risk: Loses the distinction between `priority_queue`, `human_handoff`, and `medical_emergency`

**Decision:** Option A. Both fields serve different purposes. `requires_human` is the safety gate; `escalation_level` is the routing discriminator. They coexist without conflict.

**Files affected:**
- `f/internal/ai_agent/types.ts` (lines 149-169 — `BaseIntentResultSchema`)
- Any downstream consumers of the `IntentResult` type

**Implementation steps:**
1. Add `requires_human: z.boolean().default(false)` to `BaseIntentResultSchema`
2. Ensure the AI agent's LLM output includes `requires_human` in the response
3. Add a type guard: `function isEscalationRequired(result: IntentResult): boolean` that checks `requires_human`
4. Update the NLU router to check `requires_human` before routing to the booking pipeline
5. Run full test suite

---

### HIGH-002 — AGENTS_MD_SCHEMA_DRIFT

**Severity:** HIGH
**Rule violated:** AGENTS.md §5.1
**Root cause:** `f/internal/ai_agent/constants.ts` defines intent values that don't match the `AutorizadoIntent` union in §5.1.

**Specific mismatches:**
| constants.ts value | §5.1 mandated value | Mismatch? |
|---|---|---|
| `'reagendar'` | `'reagendar_cita'` | YES |
| `'consultar_disponibilidad'` | `'ver_disponibilidad'` | YES |
| `'urgencia'` | (not in `AutorizadoIntent`) | YES — should be `'fuera_de_contexto'` |
| `'pregunta_general'` | `'duda_general'` | YES |
| `'saludo'` | (not in `AutorizadoIntent`) | YES — should be `'duda_general'` |
| `'despedida'` | (not in `AutorizadoIntent`) | YES — should be `'duda_general'` |

**Context analysis:**
The `constants.ts` file defines a richer set of intent labels for the AI Agent subsystem (which handles dialogue management, reminders, etc.). The `AutorizadoIntent` union in §5.1 is a **subset** — the minimal vocabulary for the NLU routing boundary. The AI Agent can have more granular intents internally, but the NLU boundary must use §5.1 values.

However, the audit finding is correct: the §5.1 contract says *"All intent identifiers across the entire system... MUST use the Spanish vocabulary defined below."* This means the constants file MUST use `reagendar_cita` and `ver_disponibilidad`, not the abbreviated forms.

**Fix strategy:**
1. Rename `REAGENDAR: 'reagendar'` → `REAGENDAR_CITA: 'reagendar_cita'`
2. Rename `CONSULTAR_DISPONIBILIDAD: 'consultar_disponibilidad'` → `VER_DISPONIBILIDAD: 'ver_disponibilidad'`
3. Audit all references to `INTENT.REAGENDAR` and `INTENT.CONSULTAR_DISPONIBILIDAD` across the codebase and update them
4. For intents NOT in `AutorizadoIntent` (`saludo`, `despedida`, `urgencia`, etc.): these are AI Agent-internal labels. They should remain but be documented as "internal-only — not exposed to NLU boundary"
5. Add a compile-time check that all NLU-facing intents are in the `AutorizadoIntent` union

**Files affected:**
- `f/internal/ai_agent/constants.ts` (lines 6-7 — `REAGENDAR`, `CONSULTAR_DISPONIBILIDAD`)
- All files referencing `INTENT.REAGENDAR` or `INTENT.CONSULTAR_DISPONIBILIDAD` (grep needed)
- Test fixtures referencing these values

**Implementation steps:**
1. `grep -rn "INTENT.REAGENDAR\|INTENT.CONSULTAR_DISPONIBILIDAD" f/` to find all references
2. Update constants.ts definitions
3. Update all references
4. Run full test suite — any failing test indicates a missed reference

---

### MEDIUM-001 — HARDCODED_CONFIDENCE_THRESHOLDS

**Severity:** MEDIUM
**Rule violated:** AUDITOR.md Phase 7
**Root cause:** `f/internal/ai_agent/types.ts` has inline confidence thresholds (0.85, 0.60) in the `isHighConfidence`, `isModerateConfidence`, and `isLowConfidence` functions.

**Fix strategy:**
1. Add centralized constants to `f/internal/ai_agent/constants.ts`:
   ```typescript
   export const CONFIDENCE_THRESHOLDS = Object.freeze({
     HIGH: 0.85,
     MODERATE_MIN: 0.60,
     MODERATE_MAX: 0.85,
     LOW_MAX: 0.60,
   });
   ```
2. Update `types.ts` functions to reference these constants:
   ```typescript
   export function isHighConfidence(confidence: number): boolean {
     return confidence >= CONFIDENCE_THRESHOLDS.HIGH;
   }
   ```
3. This eliminates magic numbers and ensures single-source truth for threshold values

**Files affected:**
- `f/internal/ai_agent/constants.ts` (add constants)
- `f/internal/ai_agent/types.ts` (lines 236, 241, 246 — update functions)

---

## IMPLEMENTATION ORDER

Per AGENTS.md §11.2 (Order of Operations), the fix sequence is:

```
PHASE 1: Restore deleted audit reports (CRITICAL-001)
PHASE 2: Structural rewrites (write_file/edit for all code changes)
  2a. Add constants (MEDIUM-001, CRITICAL-003)
  2b. Update types (HIGH-001, HIGH-002)
  2c. Update web booking API (CRITICAL-002)
  2d. Update tenant context (CRITICAL-003)
PHASE 3: Batch corrections (sed for any remaining references)
PHASE 4: VALIDATE
  - npx tsc --noEmit
  - npx jest --runInBand --forceExit
  - grep checks from AGENTS.md §11.6
  - Request re-audit from Auditor
```

---

## RISK ASSESSMENT

| Finding | Fix Risk | Test Break Risk |
|---|---|---|
| CRITICAL-001 (audit restore) | None | None |
| CRITICAL-002 (English strings) | Low — pure rename | Medium — test fixtures may reference old values |
| CRITICAL-003 (sentinel constant) | Low — extract to constant | None |
| HIGH-001 (requires_human) | Medium — new field on schema | Medium — tests may assert old schema shape |
| HIGH-002 (intent rename) | Medium — rename across codebase | High — many test fixtures reference INTENT.* |
| MEDIUM-001 (thresholds) | Low — extract to constant | Low — no behavioral change |

**Aggregate risk:** Medium-High. The intent rename (HIGH-002) and `requires_human` addition (HIGH-001) are the most likely to break tests. Per AGENTS.md §13, test files are READ-ONLY — if tests break, production code must be adjusted, NOT the tests.

---

## SUCCESS CRITERIA

All 6 findings resolved when:
1. ✅ `audits/AUDIT_2026-04-10T18-00-53Z.md` and `audits/AUDIT_2026-04-10T21-50-49Z.md` restored
2. ✅ Zero English action strings in `f/web_booking_api/main.ts`
3. ✅ Null-tenant sentinel extracted to named constant (not hardcoded inline)
4. ✅ `requires_human: boolean` present in `BaseIntentResultSchema`
5. ✅ `INTENT.REAGENDAR` → `INTENT.REAGENDAR_CITA` and `INTENT.CONSULTAR_DISPONIBILIDAD` → `INTENT.VER_DISPONIBILIDAD`
6. ✅ Confidence thresholds in `types.ts` reference centralized constants
7. ✅ TSC: CLEAN
8. ✅ Test suite: 218 passed / 0 failed / 0 skipped
9. ✅ Re-audit result: PASS (or fewer findings than current)

---

## ATTESTATION

This plan was derived from direct analysis of the audit report, affected source files, and the AGENTS.md/AUDITOR.md contracts. No assumptions were made about unverified code paths. No test files will be modified.

**AWAITING OPERATOR APPROVAL BEFORE PROCEEDING.**
