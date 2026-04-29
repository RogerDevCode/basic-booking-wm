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

PYTHON: 3.13  
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

WM-01 main() SYNC DEFAULT  
WM-02 FAIL → raise RuntimeError  
WM-03 wmill.* INSIDE FN ONLY  
WM-04 RESOURCE = TypedDict/Pydantic  
WM-05 cancel_running() FIRST  
WM-06 set_progress() >30s  
WM-07 task() FOR PARALLEL  
WM-08 PARTIAL FAIL → EXPLICIT  

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

## SCRIPT TEMPLATE

# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic==2.*",
#   "beartype==0.18.*",
#   "returns==0.22.*"
# ]
# ///
from __future__ import annotations  

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
