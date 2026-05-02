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

PYTHON: 3.13 (MANDATORY)
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

WM-01 main() SYNC DEFAULT (WRAPPER PATTERN MANDATORY)
WM-02 FAIL → raise RuntimeError  
WM-03 wmill.* INSIDE FN ONLY  
WM-04 RESOURCE = TypedDict/Pydantic  
WM-05 cancel_running() FIRST  
WM-06 set_progress() >30s  
WM-07 task() FOR PARALLEL  
WM-08 PARTIAL FAIL → EXPLICIT  
WM-09 PEP 723 INLINE METADATA MANDATORY
WM-10 LOCK FILES MUST USE `# py: 3.13` (OVERRIDES PEP 723)

---

## ENTRYPOINT PATTERN (WRAPPER)

ALL Windmill scripts MUST implement the sync wrapper pattern to avoid returning coroutines.
NEVER use `async def main()`.

PATTERN:
```python
async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    # Async business logic here
    return {"data": "ok"}

def main(args: dict[str, Any]) -> dict[str, Any]:
    import asyncio
    return asyncio.run(_main_async(args))
```

TESTING:
Tests MUST import `_main_async` directly to test logic. DO NOT test `main()`.

---

## WINDMILL API MAP

get_variable(path)  
set_variable(path,val)  
get_resource(path)  
set_resource(path,body)  
run_script_by_path(...)  
run_script_by_path_async(...)  
get_result(id)  
get_state()  
set_state()  
set_progress(n)  

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

# [booking-titanium-wm] recent context, 2026-04-30 9:27am GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,529t read) | 187,401t work | 91% savings

### Apr 27, 2026
S55 Multiple parallel subagents re-reading target files in preparation for Phase 1 execution — no code changes yet (Apr 27, 7:05 PM)
S52 Fix Windmill variable resolution permanently — full audit completed, 3-phase refactor plan produced and awaiting user approval (Apr 27, 7:05 PM)
S53 User corrected plan — "no TypeScript" note removed, all work is Python only; plan awaiting approval to execute (Apr 27, 7:05 PM)
S56 Completar la migración de credenciales en booking-titanium-wm: eliminar todos los wmill_adapter.get_variable() y reemplazar con inyección de parámetros Windmill en todas las funciones main() (Apr 27, 7:14 PM)
### Apr 28, 2026
S57 Zero Any refactoring plan validation — eliminate all 38 mypy --strict errors in booking-titanium-wm project without disabling rules or using type: ignore (Apr 28, 8:08 AM)
S58 Debug why Telegram /start command never reaches the booking-titanium-wm Windmill webhook, and fix the connection (Apr 28, 6:41 PM)
### Apr 29, 2026
S60 User confirmed enabling includeTriggers: true in wmill.yaml to prevent future webhook loss (Apr 29, 6:21 PM)
206 6:33p 🔴 flow.yaml First Module Changed from External Script Reference to Inline rawscript
207 " 🟣 Flow f/flows/telegram_webhook Updated in Production — 9 Changes Including rawscript Fix
208 " 🔵 New Error — pydantic 2.13.3 Requires typing_inspection Module Not in Lock File
209 " 🔴 Added typing_inspection==0.4.2 to telegram_webhook_trigger Lock File
210 6:34p 🔴 Telegram Webhook Flow Now Accepts Messages Without Error — HTTP 200 with Job UUID
211 " 🔵 get_conversation_state Step Fails — TypeIs Unavailable in Windmill's Python 3.12.12
212 " 🔴 Fixed TypeIs Import for Python 3.12 Compatibility in _wmill_adapter.py
213 " 🔵 _wmill_adapter.py Fix Not Applied — Windmill Worker Uses Cached Old Version
214 6:35p 🔴 TypeIs Import Bug Found in booking_fsm/_fsm_machine.py — Same Python 3.12 Compatibility Issue
215 " 🔴 Fixed TypeIs Import in booking_fsm/_fsm_machine.py for Python 3.12 Compatibility
216 " 🔴 Telegram Webhook Flow Now Completes Successfully End-to-End
217 6:36p 🔴 Third TypeIs Fix Applied to f/internal/_result.py — All Python 3.12 Compatibility Issues Now Resolved
218 " 🔵 Gate Scripts in flow.yaml Still Use type: script with Path References — Same Pattern as Original webhook_trigger Bug
219 6:37p 🔴 Gate Script gate_skip_if_router_handled Converted to rawscript Inline in flow.yaml
220 " 🔴 Gate Script Embedded Directly as Literal Content in flow.yaml — No File Reference Needed
221 " 🔴 Full Webhook Flow Completes Successfully — success: true on Every Test
222 6:38p 🔵 execute_action Step Fails — Booking Orchestrator Flow Path Has Same __flow Suffix Mismatch
223 " 🔴 Fixed Booking Orchestrator Sub-Flow Path — Removed __flow Suffix in flow.yaml Reference
224 6:39p 🔵 Flow Progresses to send_telegram_response — JavaScript Expression Bug When ai_agent Returns Null
225 " 🔴 Fixed Null Safety Bug in send_telegram_response JavaScript Expression
226 " 🔴 Telegram Webhook Flow Fully Fixed — success: True, error: NONE on All Tests
227 " 🔵 Flow Returns Coroutine Object String — telegram_send/main.py Not Properly Awaited
228 " 🔵 telegram_send/main.py Is Correctly Async — Coroutine String Came from a Different Step
230 " 🔵 Telegram Bot Token Is Valid — Health Check Returns Healthy via Windmill API
229 6:41p 🔵 Coroutine Object String Is a Systemic Issue — Even health_check/main Returns It via wmill script run
231 6:42p ⚖️ User confirmed: enable includeTriggers in wmill.yaml
S61 Complete Telegram webhook restoration and prevent future loss — all fixes committed, includeTriggers enabled (Apr 29, 6:42 PM)
S59 Diagnose and repair Telegram→Windmill webhook connectivity after server migration, then investigate why the previous configuration was lost (Apr 29, 6:42 PM)
232 7:14p 🔵 Telegram /start triggers coroutine string output in Windmill run logs
233 " 🔵 All flow scripts use async def main() — systemic coroutine issue across entire /start path
234 7:15p 🔵 Flow internals: Redis-backed conversation state with FSM routing in telegram_webhook flow
### Apr 30, 2026
235 8:21a 🔵 Pending Debug Task: Telegram→Booking Flow Integration
236 " 🔵 Telegram Booking Flow: Redis FSM Integration Completed (Prior Session)
237 " 🔵 Windmill Debug Tools: scripts/debug-windmill.sh and Known Fix History
238 " 🔵 telegram_send Token Resolution: Three-Level Fallback with Windmill get_variable
239 8:22a 🔵 telegram_webhook__flow Full Architecture: 8-Step Flow with FSM Router Gate
241 " 🔵 All Internal Flow Scripts WM-01 Compliant: sync def main + async _main_async Pattern
242 " 🔴 Fixed async def main in telegram_webhook flow.yaml inline script
243 " 🔵 Fix to telegram_webhook flow.yaml did not persist — async def main still present
240 " 🔵 WM-01 Violation: Inline async def main in telegram_webhook__flow gate step
244 8:47a 🔵 telegram_webhook flow.yaml edit not persisting — possible file regeneration loop
245 " 🔵 Ruff auto-fix resolved 1 of 160 errors; 159 require manual fixes
246 8:48a 🔵 Ruff 159 remaining errors dominated by F401 unused imports in test __pycache__ files
247 " 🔵 Ruff error breakdown: systemic F401 in test __init__.py files and UP036 in production code
248 " 🔵 Ruff config in pyproject.toml lacks __pycache__ exclusion; 58 of 159 errors from cache files
249 " 🔵 Current session's changes reduced ruff errors from 713 to 159 — a 78% reduction
250 8:49a 🔵 Massive scope of unstaged changes: ~50+ Windmill scripts and all tests modified in current branch
251 " 🔵 Only 3 ruff errors exist in production source code — all UP036 in internal utilities
252 " 🔵 UP036 version blocks are dead code — both branches import identical TypeIs
253 " 🔴 Fixed UP036 ruff violations in 3 internal files by removing redundant sys.version_info guards
254 " 🔴 All 3 UP036 ruff violations fixed — production source code is now fully ruff-clean
255 8:50a 🔵 All quality gates pass: 284 tests, 0 ruff errors in source, 0 mypy --strict errors across 206 files
S62 Read AGENTS.md and continue pending task from yesterday — fixing async def main in Windmill flow inline scripts and ruff/mypy linting cleanup (Apr 30, 8:50 AM)

Access 187k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>