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

---

## STACK

PYTHON: 3.13 (MANDATORY EXCLUSIVITY)  
- Absolutely NO Python 3.12 references allowed.
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

src/
  booking_create.py
  booking_cancel.py
  booking_validate.py
  booking_fsm.py
  models.py
  errors.py

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

## PERFORMANCE

- BATCH OPS  
- MIN I/O  
- CACHE WHEN SAFE  

---

## FINAL DIRECTIVE

DISCIPLINE > SPEED  
STRICTNESS > FLEXIBILITY  
DETERMINISM > MAGIC  

EXECUTE. NO DEVIATION.

---

## DEV CONTEXT & SYNTHESIS (APRIL 2026)

**Última Actualización:** Refactorización Arquitectónica de Windmill (Flujos asíncronos y Orquestación).

**Estado Actual del Sistema:**
1. **Resolución `async/await` (WM-01):** Todos los 54 entrypoints usan el patrón *Sync Wrapper* (`asyncio.run(_main_async)`). Ya no se devuelven objetos `coroutine` a Windmill.
2. **Sandboxing (WM-09):** Inyectados los metadatos de dependencias (PEP 723) en la cabecera de todos los scripts para evitar caídas por `ModuleNotFoundError` (ej. `beartype`).
3. **Redis Hardening:** `_redis_client.py` inyecta automáticamente el esquema `redis://` si el entorno provee únicamente el hostname.
4. **Orquestador Resiliente (Graceful Exit):** `OrchestratorInput` ahora acepta cualquier `intent`. Si la IA devuelve algo no relacionado con agendar (ej. `duda_general`), el orquestador ignora la ejecución y delega la respuesta a la IA para no interrumpir el flujo conversacional con errores de validación de Pydantic.
5. **Estabilidad Estricta:** 100% de cumplimiento en tipado estático (`mypy --strict` 0 errores) y 284 pruebas unitarias pasando (`pytest -q`).

**Próximos Pasos (Tras lanzar `/start` mañana):**
Validar end-to-end el flujo en Telegram. El flujo debería poder saludar, mantener contexto en Redis, evaluar intenciones sin crashear el orquestador y finalmente agendar/cancelar si la intención es estricta. Todo está preparado en el código.


<claude-mem-context>
# Memory Context

# [booking-titanium-wm] recent context, 2026-05-07 1:17pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,478t read) | 201,982t work | 92% savings

### May 6, 2026
S88 Add client overlap validation to prevent double-booking with multiple providers at same time (May 6, 5:55 PM)
S89 Store frontend role-based permission matrix (client, provider, admin, superuser) in persistent memory to preserve scope (May 6, 6:05 PM)
S90 Fix booking system validation: verify existing appointments before showing available doctor slots (May 6, 6:25 PM)
458 7:01p 🔵 Missing Appointment Query Feature Blocks Conflict Validation
459 " 🟣 Active Booking Detection Query Added to Prefetch Service
460 7:02p 🔴 Business Rule Validation: Block Doctor Selection if Client Has Active Booking
461 " ✅ Windmill Entrypoint Updated to Accept and Forward client_id
462 " ✅ RouterInput Model Extended with prefetch_block_reason Field
463 " 🟣 Router Implements User-Facing Error Handling for Active Booking Conflicts
464 " ✅ Flow Configured to Pass client_id to Booking Prefetch Service
465 " ✅ Router Input Updated to Receive prefetch_block_reason from Flow
466 7:03p ✅ Changes Validated and Deployed to Production
S91 Fix booking system that adds 40-minute wait time to first slot; reservations should start at 9:00 AM instead of 9:40 AM. Delete current reservations and reset for tomorrow. (May 6, 7:03 PM)
467 7:22p 🔵 Buffer time added to service duration causing 40-minute booking offset
468 7:23p 🔵 Python 3.12 import compatibility error in internal adapter module
469 " 🔵 TypeIs type guard used across multiple internal modules
470 " 🔴 Add typing_extensions fallback for TypeIs import compatibility
471 " 🔴 Apply TypeIs import fallback to FSM state machine module
473 " 🔴 Type checking passes successfully after removing unnecessary ignore comments
474 7:24p ✅ TypeIs compatibility fix deployed to Windmill workspace
475 " 🔵 Deployed TypeIs fix not reflected in Windmill worker execution
476 7:25p 🔵 Services table shows 10-minute buffer, not 40-minute delay reported by user
478 " ✅ Old test booking and audit record deleted from database
479 7:26p 🔴 Remove buffer addition from slot duration calculation in scheduling logic
480 " ✅ Scheduling buffer fix deployed to Windmill workspace
S92 Diagnose and fix why booking system won't offer appointments for today despite available hours remaining; implement proper buffer time spacing in slot generation. (May 6, 7:26 PM)
481 7:30p 🔵 Booking system has no test providers or configured schedules
482 " 🔵 Roger Gallegos provider is configured with working schedule but only for Thursday
483 7:32p 🔴 Slot generation now respects buffer time between appointments
484 " ✅ Availability engine now calculates and passes buffer spacing to slot generation
485 " 🔵 Slot generation correctly produces 13 appointments for Thursday with 40-minute spacing
486 " ✅ Buffer spacing fix deployed to production Windmill workspace
S93 Fix booking confirmation flow - system wasn't allowing appointment confirmation for same-day bookings with remaining hours (May 6, 7:33 PM)
487 7:38p 🔵 Booking system database state and FSM confirmation flow verified
488 7:40p 🔴 FSM ConfirmingState now handles numeric button inputs for booking confirmation
489 " ✅ FSM confirmation state fix deployed to Windmill
S94 Implement "mis citas" (my appointments) feature for Telegram bot to show clients their active appointments with doctor, date/time, and reference ID. Web frontend enhancements (like appointment history) noted as separate work. (May 6, 7:40 PM)
490 8:58p 🔵 Mis Citas (My Appointments) Module Currently Stubbed
491 " 🔵 Booking System Data Structure for Mis Citas Implementation
492 " 🟣 Added Database Access Parameters to Telegram Router
493 8:59p 🟣 Implemented Mis Citas (My Appointments) Feature in Telegram Router
494 " ✅ Activated Mis Citas Feature Handler
495 " ✅ Wired Client ID and Database URL Through Telegram Webhook Flow
496 " 🔵 Telegram Router Type Safety Verified
497 " ✅ Mis Citas Feature Deployed to Windmill
S95 Format booking reference IDs with dash grouping (F13E0DEF → F1-3E0-DEF) for improved readability across all user-facing messages (May 6, 9:00 PM)
498 9:04p 🔵 Short ID reference generation mapped across booking system
499 9:05p 🔵 Telegram webhook flow references booking short ID in display template
500 " 🟣 Booking reference formatting with grouped display
501 " 🟣 Booking confirmation reference formatting applied
502 " 🟣 Reminder cron reference formatting applied
503 9:06p ✅ Reference formatting changes deployed to Windmill
S96 Create and save a detailed implementation plan for improving the Reminder Module menu in booking-titanium-wm, optimized for LLM readability and continuation in future sessions. (May 6, 9:06 PM)
504 9:18p 🔵 Existing Reminder System Architecture and Preferences Storage
505 " 🔵 Reminder Configuration UI and Message Handler Pattern
506 9:19p 🔵 Hardcoded Reminder Windows and Current Notification Dispatch Pattern
507 9:21p ⚖️ Comprehensive Reminder System Refactoring Plan: Expandable Windows, Channel Abstraction, Telegram UI Integration
508 9:31p ⚖️ Reminder Module Expansion Plan — 7-Window Architecture with Quiet Hours
S97 User initiated primary session with greeting "hi" (May 6, 10:03 PM)
### May 7, 2026
509 11:27a ⚖️ Critical review and architectural revision of reminder menu improvement plan

Access 202k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>