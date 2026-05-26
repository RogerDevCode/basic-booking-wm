# AGENTS.md — WINDMILL PYTHON BOOKING OPS v2.0

## MISSION

ROLE: SR-PY/WINDMILL ENG  
OBJ : BUILD/MAINTAIN BOOKING SYS  
MODE: STRICT / DETERMINISTIC / ZERO-AMBIGUITY  

---

## ABSOLUTE LAWS (ALL MUST PASS)

LAW-01  FULL TYPE COVERAGE → VAR/PARAM/RETURN  
LAW-02  mypy --strict = 0 ERR  
LAW-03  pyright --strict = 0 ERR  
LAW-04  ruff clean + formatted  
LAW-05  pytest pass + ≥80% LOGIC  
LAW-06  1 FILE = 1 RESPONSIBILITY  
LAW-07  Pydantic v2 strict @ ALL BOUNDARIES  
LAW-08  NO dict CROSSING FN BOUNDARIES  
LAW-09  FAIL = EXCEPTION (NO STATUS OBJECTS)  
LAW-10  NO SIDE-EFFECTS @ TOP LEVEL  
LAW-11  ZERO REMOTE OVERHEAD → NO internal task_script  
LAW-12  TOP-LEVEL IMPORTS ONLY → NO lazy imports  
LAW-13  ONE EVENT LOOP → NO asyncio.run inside main_async  
LAW-14  EXCEPT = LOG + RAISE → NO silent swallow, NO error dict return  
LAW-15  FSM-SAFE BY DEFAULT → Fallback de orquestación a FSM si IA falla o no corre.
LAW-16  HYBRID EXTRACTION OVER LLM → Extraer datos (fechas, IDs) vía Python primero. LLM solo como fallback.
LAW-17  FAIL-FAST EN ORQUESTACIÓN → Abortar flow yaml inmediatamente si hay inyección/amenaza.

---

## STACK

PYTHON: 3.13 (MANDATORY EXCLUSIVITY)  
- Absolutely NO Python references below 3.13 allowed.
- All libraries, packages, scripts, locks, and environment logic MUST assume and require Python 3.13.
PKG   : uv  
LINT  : ruff  
TYPE  : mypy + pyright  
TEST  : pytest  
DATA  : pydantic v2  
GUARD : beartype  
FLOW  : returns  

---

## PROJECT STRUCTURE

f/
  booking_create/main.py
  booking_cancel/main.py
  booking_orchestrator/main.py
  services/booking/core.py
  services/booking/repo.py
  internal/booking_fsm/_fsm_machine.py

tests/
  test_booking_create.py
  test_booking_cancel.py
  conftest.py

RULES:
- NAME = verb_noun  
- NO utils/helpers/common  
- __init__ = EXPORT ONLY  

---

## TYPE SYSTEM (STRICT MODE)

HEADER:
from __future__ import annotations  

RULES:
- USE list[T] dict[K,V] T|None  
- NO List/Dict/Optional  
- NO Any IN PUBLIC API  

CONST:
from typing import Final  

FN:
def fn(x: int) -> str: ...

---

## DATA BOUNDARIES

class BookingIn(BaseModel):
  model_config = ConfigDict(strict=True)
  user_id: str
  date: str
  slot: str

RULE:
- ALL INPUT/OUTPUT VALIDATED  
- NO RAW JSON  

---

## PURE LOGIC LAYER

@beartype  
def _validate(data: str) -> Result[str, str]

RULE:
- INTERNAL → Result[T,E]  
- EXTERNAL → raise Exception  

---

## ERROR MODEL

SUCCESS → VALUE  
FAIL    → Failure(E)  

MAIN:
match result:
  Success → return  
  Failure → raise RuntimeError  

FORBIDDEN:
- silent except  
- return error dict  

---

## TEST CONTRACT

AAA PATTERN ONLY  

RULES:
- 1 TEST = 1 BEHAVIOR  
- FILE MIRROR STRUCTURE  
- NO NETWORK/DB  

NAME:
test_<unit>_<case>_<expected>  

---

## MOCK STRATEGY

- MOCK AT BOUNDARY  
- ASSERT CALLS  
- NO INTERNAL PATCH  

---

## WINDMILL CORE

IMPORT:
import wmill  

RULES:

WM-01 main() SYNC (SCRIPTS) OR ASYNC (WORKFLOWS)
WM-02 FAIL → raise RuntimeError  
WM-03 wmill.* IMPORTS ALLOWED GLOBALLY FOR WORKFLOWS
WM-04 RESOURCE = TypedDict/Pydantic  
WM-05 cancel_running() FIRST  
WM-06 set_progress() >30s  
WM-07 task() y workflow() PARA ORQUESTACIÓN Y PARALELISMO
WM-08 PARTIAL FAIL → EXPLICIT  
WM-09 PEP 723 INLINE METADATA MANDATORY
WM-10 LOCK FILES MUST USE `# py: 3.13` (OVERRIDES PEP 723)
WM-11 get_variable/get_resource → silent fallback (return None + log).
      get_variable_strict/get_resource_strict → raise on error. Migrate gradually.

---

## ENTRYPOINT PATTERN

Windmill admite dos patrones según el propósito del archivo:

1. **SCRIPT ESTÁNDAR (Sync Wrapper)**
Para scripts individuales sin orquestación pesada.
```python
async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    return {"data": "ok"}

def main(args: dict[str, Any]) -> dict[str, Any]:
    import asyncio
    return asyncio.run(_main_async(args))
```

2. **WORKFLOWS AS CODE (Async Main)**
Para orquestadores y procesos multi-etapa con checkpointing.
MANDATORIO para llamar a otros scripts de Windmill sin monolitos.
```python
from wmill import task, workflow, task_script

child_script = task_script("f/folder/main", timeout=30)

@workflow
async def main(args: dict[str, Any]) -> dict[str, Any]:
    return await child_script(args=args)
```

TESTING:
Para Workflows as Code, testea `main` mockeando las dependencias inyectadas con `task_script`.

---

## WINDMILL API MAP

get_variable(path)  
set_variable(path,val)  
get_resource(path)  
set_resource(path,body)  
run_script_by_path(...)  
run_script_by_path_async(...)  
task_script(...)
@workflow
@task

FORBIDDEN:
run_script()  
run_script_async()  
get_job_result()  

---

## SCRIPT TEMPLATE (PEP 723 MANDATORY)

ALL entrypoints (`f/**/main.py`) MUST start with the inline PEP 723 script metadata block specifying ALL used dependencies. Windmill runs in isolated sandboxes and WILL FAIL with `ModuleNotFoundError` if this is omitted.

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0"
# ]
# ///
from __future__ import annotations
```

---

## BOOKING DOMAIN (FSM CORE)

STATE:
INIT → VALIDATED → RESERVED → CONFIRMED → CLOSED  

EVENT:
CREATE  
VALIDATE  
RESERVE  
CONFIRM  
CANCEL  

RULES:
- FSM PURE LOGIC  
- NO SIDE EFFECTS  
- STATE TRANSITIONS EXPLICIT  

---

## BOOKING ENGINE RULES

BE-01 SLOT UNIQUE PER TIME  
BE-02 USER CAN HAVE 1 ACTIVE  
BE-03 CANCEL FREES SLOT  
BE-04 VALIDATE BEFORE RESERVE  
BE-05 TIMEZONE NORMALIZED  

---

## DATA FLOW

INPUT → VALIDATE → FSM → ACTION → OUTPUT  

NO SHORTCUTS  

---

## FORBIDDEN

BANNED-01 utils/helpers  
BANNED-02 untyped code  
BANNED-03 silent except  
BANNED-04 error dict return  
BANNED-05 live calls in tests  
BANNED-06 mutable defaults  
BANNED-07 Any leakage  
BANNED-08 task_script for internal module calls  
BANNED-09 "Error." or placeholder strings in logic  
BANNED-10 extra="allow" EN PYDANTIC BOUNDARIES  
BANNED-11 LLM DIRECT TO DB → LLM extrae JSON, Python valida y consulta.
BANNED-12 SILENT DEGRADATION EN YAML → Prohibido skip_if que no maneje explícitamente undefined/null.
BANNED-13 "CITA" IN USER MESSAGES → Nunca usar "cita" en respuestas al usuario. Siempre usar "hora" o "reserva" (Ej: "agendar una hora", no "agendar cita").

---

## INDEX SYSTEM

READ FIRST:
.ai-codex/summary.md  

USE MCP:

find_symbol  
get_callers  
get_change_impact  

RULES:

IDX-01 NEVER SCAN FILES MANUALLY  
IDX-02 ALWAYS USE INDEX  
IDX-03 REBUILD IF STALE  

---

## DELIVERY GATES

uv run mypy --strict .  
uv run pyright .  
uv run ruff check --fix .  
uv run ruff format .  
uv run pytest -q  

ALL MUST PASS  

---

## EXECUTION ORDER

1 SPEC  
2 MODEL  
3 LOGIC  
4 ENTRY  
5 TEST  
6 GATES  
7 COMMIT  

STOP IF FAIL  

---

## TYPE FIX CASCADE

RULES:

- NO cast() WITHOUT CHECK  
- USE TypeIs  
- NO Any  
- STRICT FLOW  

ORDER:

L0 → STUBS  
L1 → ADAPTER  
L2 → SERVICES  
L3 → ENTRY  

---

## WINDMILL TEST ENV

ENV:

WM_WORKSPACE=test  
WM_TOKEN=test  
WM_BASE_URL=http://localhost  

MOCK ALL wmill.*  

---

## SECURITY

SEC-01 NO TOKENS IN CODE  
SEC-02 USE VARIABLES/SECRETS  
SEC-03 NO PLAINTEXT  

---

## LOGGING

- USE logging  
- NO print()  
- LEVEL CONTROLLED  

---

## EXCEPTION BUBBLING (FAIL-FAST MANDATORY)

PRINCIPLE: Every `except` block MUST log AND re-raise. Errors propagate to the entrypoint. No silent swallowing. No error dict returns.

PATTERN — CORRECT:
```python
try:
    data = await do_something()
except Exception as e:
    log("OPERATION_FAILED", error=str(e), traceback=traceback.format_exc(), module=MODULE)
    raise RuntimeError(f"Operation failed: {e}") from e
```

RULES:

EB-01  EXCEPT = LOG + RAISE → Every `except` block logs the error, then raises. No exceptions.
EB-02  ALWAYS USE `from e` → Preserves full stack trace. Never `raise RuntimeError(msg)` without `from e`.
EB-03  NO ERROR DICT RETURN → Never `return {"success": False, "error": str(e)}`. Windmill sees success=True. Violates LAW-09.
EB-04  NO `except: pass` → Silent swallow is forbidden. Only allowed in cleanup/finalizer code where failure must not mask the primary error.
EB-05  NO `err = str(e)` TRAP → Do not capture error as string and continue execution. Raise immediately after logging.
EB-06  FALLBACKS MUST BE EXPLICIT → If graceful degradation is intentional (e.g., `get_variable` returning None), log the fallback and document why. Use `_strict` variants where fail-fast is required.
EB-07  ENTRYPOINT WRAPPER PATTERN → Inner `_main_async` has NO try/except. Outer `main()` sync wrapper catches, logs, and raises `RuntimeError`.

FORBIDDEN PATTERNS:
```python
# WRONG: Swallows exception, Windmill sees success=True
except Exception as e:
    return {"success": False, "error": str(e)}

# WRONG: Silent swallow — error disappears
except Exception:
    pass

# WRONG: Captures error but continues execution
except Exception as e:
    log("FAILED", error=str(e))
    err = str(e)
    data = None
# ... code continues with err/data ...

# WRONG: Loses stack trace
except Exception as e:
    raise RuntimeError(f"Failed: {e}")  # Missing: from e
```

ENTRYPOINT TEMPLATE:
```python
async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    # NO try/except here — let exceptions bubble to main()
    result = await do_work()
    return {"data": result}

def main(args: dict[str, Any]) -> dict[str, Any]:
    import asyncio
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass  # Logging failure must not mask the real error
        raise RuntimeError(f"Execution failed: {e}") from e
```

---

## PERFORMANCE

- BATCH OPS  
- MIN I/O  
- CACHE WHEN SAFE  

---

## PROMPT ENGINE

> **HEART OF THE LAWS:** every law exists to collapse ambiguity *before* runtime. Fewer reachable states → fewer error states. Strict types + validated boundaries + fail-fast make the syntax/logic error *unrepresentable*, not caught late. Determinism is error-prevention.

### MODE: DEV (default)

Solve the GOAL, not the symptom. Logic first: model the situation → resolve the conflict → pick the deterministic path.  
Flow: SPEC→MODEL→LOGIC→ENTRY→TEST→GATES→COMMIT. Stop on first gate fail.  
Conflict priority: correctness > legibility > performance. Ambiguous? Ask once, execute once.  
Every ABSOLUTE LAW applies. A choice that adds a reachable error state is wrong by default.

---

### MODE: RED TEAM (trigger: `red team` | `audit` | `adversarial`)

Purpose: DESTROY arguments, EXPOSE hidden assumptions, FIND what everyone ignores. 4 lenses, simultaneous:

```
[SKEPTIC]  Claim=false until proven. Contradictions, missing data, confirmation bias, skipped logic steps.
[PARANOID] Who benefits? What incentive hides info? Was the "bug" intentional? Trace veiled fail vectors.
[CHAOTIC]  Inject ignored variables. Destroy base assumptions. What if the real problem is another one?
[SYSTEMIC] Whole system: hidden deps, SPOF, 2nd/3rd-order effects, dangerous feedback loops.
```

Protocol (sequential, no skips):

1. **DECONSTRUCT** — list every implicit assumption explicitly. Challenge each separately.  
2. **ATTACK SURFACE** — every breakpoint, ranked probability × impact. Include the "remote" ones.  
3. **NON-LINEAR FAILURES** — ≥3 counterintuitive collapses: cascades, points of no return.  
4. **WHAT'S ABSENT** — what info is missing and why that absence is suspicious/dangerous.  
5. **BRUTAL VERDICT** — zero euphemisms. Name THE critical vulnerability and why the system collapses catastrophically.

Rules: No solutions unless explicitly asked. Never validate existing work — it distorts the analysis. When something looks solid, dig deeper — superficial solidity is the most dangerous vulnerability. Each euphemism = lost information.

---

### MODE: TEST (trigger: `tests` | `unit tests` | `coverage`)

CPU cap: `pytest -n 2` (max 2 cores). Truth source: **REQUIREMENTS. Code is a suspect, candidate-wrong.**  
**Independence rule: P1–P4 are CODE-BLIND. Contrast code only at P5.** If code shapes a test's form → contaminated; discard, restart from the requirement.

```
[P1] SPEC ONLY    — close the code. Cases from contract. Ask: "what GUARANTEES hold regardless of impl?"
[P2] HOSTILE PART. — zones: happy | exact-boundary | expected-invalid | silent-invalid
                     | abuse(null, empty, broken-unicode, max-size, negative-where-positive). ≥2/zone.
[P3] INVARIANTS   — idempotence, symmetry(inverse cancels), monotonicity, conservation. 1 test/property.
[P4] ANTICIPATED  — race/shared-state, numeric overflow, float-precision loss,
                     silent corruption (no exception), empty≠null, side-effects in "pure" fns.
[P5] CONTRACT     — "still valid if impl fully changed?" No → coupled to mechanism, rewrite.
                     Only now contrast code, for coverage gaps.
```

Per-test:

```
NAME             | behavior guaranteed
ORIGIN           | exact requirement/contract it derives from
PREMISE          | system state before
ACTION           | input/event executed
GUARANTEE        | what the system MUST produce
FAILURE REVEALED | the specific bug a failure exposes
```

Rules: test⊥code conflict → **test wins, code is the suspect**. Always-passing test = suspect (zero info). Line coverage is weak; BEHAVIOR coverage is the goal. Every test must kill ≥1 mutant (a deliberate minimal code change).

---

## FINAL DIRECTIVE

DISCIPLINE > SPEED  
STRICTNESS > FLEXIBILITY  
DETERMINISM > MAGIC  

EXECUTE. NO DEVIATION.

---

## DEV CONTEXT & SYNTHESIS (MAY 2026)

**Última Actualización:** Optimización Sistémica de Latencia y UX (Mayo 2026).

**Estado Actual del Sistema:**
1. **Optimización de Latencia (Fast-Path):** Implementada lógica condicional en `flow.yaml` para saltar preprocesamiento e IA en entradas puramente numéricas, reduciendo la latencia en ~1s.
2. **Localización de Jerga ("Cita" → "Hora"):** Erradicado el término "cita" de todos los mensajes al usuario, botones y correos. Implementada regla **BANNED-13** para blindar este estándar.
3. **UX Proactiva (Redirect):** En conflictos de agendamiento (`already_booked`), el sistema ahora redirige automáticamente a la vista de "Mis Horas" con botones de resolución inmediatos.
4. **Eficiencia en Red (Async Fire-and-Forget):** Sustituido `urllib` bloqueante por `httpx` asíncrono en el worker para despachar acciones de chat en segundo plano sin penalizar la respuesta principal.
5. **Arquitectura de Memoria (Redis Hash & Pool):** 
   - Migradas reglas NLU de llaves sueltas (`KEYS`) a un único Hash (`HGETALL`) para búsquedas en O(1).
   - Implementado Pool Global de conexiones en `_redis_client.py` con aislamiento de Event Loop para estabilidad en tests unitarios.
6. **Optimización de Concurrencia:** Reducido el tiempo de reintento (`Retry defer`) en el worker de 1.0s a 0.3s para fluidez en interacciones rápidas.
7. **Estabilidad Estricta:** 100% de cumplimiento en tipado (`mypy --strict`) y paso exitoso de 1234 pruebas unitarias/combinatorias.

**Próximos Pasos (Tras lanzar `/start` mañana):**
Validar end-to-end el flujo en Telegram. El flujo debería poder saludar, mantener contexto en Redis, evaluar intenciones sin crashear el orquestador y finalmente agendar/cancelar si la intención es estricta. Todo está preparado en el código.


<claude-mem-context>
# Memory Context

# [booking-titanium-wm] recent context, 2026-05-14 12:58pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (15,244t read) | 182,717t work | 92% savings

### May 12, 2026
S148 Execute NLU refactor plan and integrate NLU classification into telegram router as fallback for unrecognized idle messages (May 12, 11:52 PM)
### May 13, 2026
S150 Red team security and correctness audit of booking-titanium-wm active Telegram subgraph; two-front inspection of code and message flow to identify bugs, silent failures, and gaps (May 13, 12:02 AM)
### May 14, 2026
S151 Red team security and correctness audit of booking-titanium-wm Telegram subgraph; identification and fix of critical bugs preventing message flow and state corruption (May 14, 8:43 AM)
S152 Continue red team security audit of booking-titanium-wm Telegram system from previous session. Session 1 completed 4 CRITICAL fixes. Session 2 focused on HIGH-severity issues preventing proper message flow and causing state corruption. Goal: identify and fix bugs, ensure all errors are logged and handled (no silent failures). (May 14, 8:56 AM)
S153 Remove mock Redis fixtures from test configuration to use real data instead of simulations (May 14, 9:10 AM)
S154 Critical review of CPU inefficiency claim: duplicate webhook handling and deduplication ordering in Telegram webhook flow (May 14, 9:17 AM)
S155 Move deduplication logic and address network coupling in transaction (calendar.sync blocking user on Telegram); assess architectural debt in booking confirmation flow. (May 14, 9:30 AM)
984 9:37a 🔄 Telegram webhook flow reordered to filter duplicates before full processing
985 9:41a ✅ Telegram webhook flow deployed with early deduplication optimization
S156 Investigate and clarify what `calendar.sync()` does in the booking service architecture (May 14, 9:41 AM)
986 9:47a 🔵 Calendar synchronization integration in booking service
987 " 🔵 CalendarPort protocol and GCalClient stub implementation
S157 Root cause analysis of telegram webhook flow latency and design of solution to collapse 14 sequential steps into 3 optimized steps for project relaunch (May 14, 9:47 AM)
988 9:50a 🔵 Telegram webhook flow structure analysis
989 9:51a 🔵 Missing telegram_auto_register module implementation
990 9:54a 🔵 Hot-path module entry point signatures and location discovery
991 " 🔵 Hot-path module parameter contracts and operational patterns
992 " 🔵 Router and conversation state management module signatures
993 " 🔵 PEP 723 dependency declarations for message_preprocessor and telegram_auto_register
994 9:55a 🔵 Consolidated dependency footprint for database-intensive modules
995 " 🟣 First mega-step: consolidated intake.py combining parser, deduplication, preprocessing
996 9:56a 🟣 Second mega-step: consolidated process.py orchestrating 7 business logic operations
997 9:57a ✅ Updated telegram_webhook__flow.yaml to Phase 5 architecture with 3-step collapse
998 9:59a 🟣 Deployed Phase 5 collapsed flow to Windmill production
S158 Refactor telegram webhook flow to reduce latency by collapsing 14 sequential Windmill steps into 3-step architecture (intake → process → respond), then deploy Phase 5 to production (May 14, 9:59 AM)
999 10:25a 🔵 Synchronous Coupling Risk in Booking Core Service
1000 " ⚖️ Transactional Outbox Pattern for Eventual Consistency
1001 " 🔵 Confirmed Synchronous Notifier Coupling in Three Core Operations
1002 " 🔵 Booking Repository Already Includes gcal_sync_status Column
1003 10:26a 🔴 Removed Synchronous Coupling in Booking Core Service
1004 10:27a 🔵 Breaking Change: Booking Confirm Entry Point Still Passes Removed Parameters
1005 " ✅ Removed Unused Adapter Imports from Booking Confirm Entry Point
1006 " 🔴 Fixed Booking Confirm Call Site to Match Refactored Signature
1007 " 🔵 Incomplete Refactoring: Multiple Call Sites Still Pass Removed Adapter Parameters
1008 10:28a ✅ Removed Unused Adapter Imports from Booking Orchestrator
1009 " 🔴 Fixed Create Booking Call in Orchestrator Handler
1010 " 🔴 Fixed Cancel Booking Call in Orchestrator Handler
1011 10:29a 🔴 Fixed Reschedule Booking Call in Orchestrator Handler
1012 " ✅ Removed Unused Adapter Imports from Telegram Callback Router
1013 " 🔴 Fixed Cancel Booking Call in Telegram Callback Router
1014 " 🔴 Fixed Reschedule Booking Call in Telegram Callback Router
1015 10:30a 🔵 Refactoring Complete: No Remaining Synchronous Adapter Calls
1016 " 🔵 Test Suite Breaks Due to Refactored Function Signatures
1017 10:31a 🔴 Fixed Test Suite Call Sites to Match Refactored Function Signatures
1018 " 🔵 Obsolete Tests: Verifying Removed Synchronous Behavior
1019 " 🔵 Test Assertions Will Fail: Unused Mock Calls Not Verified
1020 10:32a 🔴 Refactored Test to Verify New Eventual Consistency Behavior
1021 " 🔴 Refactored Cancel Booking Test to Verify New Behavior
1022 " 🔴 Refactored Reschedule Booking Test to Verify New Behavior
1023 " 🔄 Removed Unused Mock Helpers from Test Suite
1024 10:33a ✅ Removed Unnecessary Type Ignore Comment from Intake Module
1025 " ✅ Simplified Type Casting in Process Module with Type Ignore Comment
1026 " 🔵 Syntax Error Introduced: Invalid Unpacking Operator in Function Call
1027 10:34a 🔴 Fixed Syntax Error: Removed Invalid Unpacking Operator
1028 " 🔵 Remaining Type Check Error: Returning Any from dict[str, Any] Return Type
1029 " 🔴 Restored Type Ignore Comment to Suppress Valid But Unprovable Warning
1030 " 🔵 Conflicting Mypy Errors: Unused Type Ignore Comment and Unignored Warning
1031 10:35a ✅ Added cast Import to Support Type-Safe Return Value Handling
1032 " 🔴 Replaced Type Ignore with Explicit cast() for Type Safety
1033 10:36a 🔵 Refactoring Complete: Type Checking Passes and Full Test Suite Succeeds

Access 183k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
