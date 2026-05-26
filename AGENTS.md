# AGENTS.md — PYTHON BOOKING OPS v3.0

## MISSION

ROLE: SR-PY/BACKEND ENG  
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
LAW-11  EXCEPT = LOG + RAISE → NO silent swallow, NO error dict return  
LAW-12  FSM-SAFE BY DEFAULT → Fallback de orquestación a FSM si IA falla o no corre.
LAW-13  HYBRID EXTRACTION OVER LLM → Extraer datos (fechas, IDs) vía Python primero. LLM solo como fallback.
LAW-14  BANNED-13: "CITA" IN USER MESSAGES → Nunca usar "cita" en respuestas al usuario. Siempre usar "hora" o "reserva".

---

## STACK

PYTHON: 3.13 (MANDATORY EXCLUSIVITY)  
PKG   : uv  
LINT  : ruff  
TYPE  : mypy + pyright  
TEST  : pytest  
DATA  : pydantic v2  
GUARD : beartype  
FLOW  : returns  
QUEUE : arq (Redis)  
DB    : postgresql (asyncpg)

---

## PROJECT STRUCTURE

f/
  booking_create/main.py
  booking_cancel/main.py
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

---

## PERFORMANCE

- BATCH OPS  
- MIN I/O  
- CACHE WHEN SAFE  
- CONNECTION POOLING (Redis/Postgres)

---

## PROMPT ENGINE

> **HEART OF THE LAWS:** every law exists to collapse ambiguity *before* runtime. Fewer reachable states → fewer error states. Strict types + validated boundaries + fail-fast make the syntax/logic error *unrepresentable*, not caught late. Determinism is error-prevention.

### MODE: DEV (default)

Solve the GOAL, not the symptom. Logic first: model the situation → resolve the conflict → pick the deterministic path.  
Flow: SPEC→MODEL→LOGIC→ENTRY→TEST→GATES→COMMIT. Stop on first gate fail.  

---

## DEV CONTEXT & SYNTHESIS (MAY 2026)

**Última Actualización:** Eliminación de Windmill e Infraestructura Pure-Python (Mayo 2026).

**Estado Actual del Sistema:**
1. **Arquitectura Independiente:** Windmill ha sido eliminado. El sistema ahora opera como una aplicación Python pura usando FastAPI (Gateway) y Arq (Workers).
2. **Optimización de Latencia (Fast-Path):** Lógica de atajos numéricos integrada en el flujo para evitar IA en comandos simples.
3. **Localización de Jerga ("Cita" → "Hora"):** Erradicado el término "cita". Implementada regla **BANNED-13**.
4. **Eficiencia en Red:** Uso de `httpx` asíncrono y Pool Global de Redis.
5. **Estabilidad Estricta:** 100% de cumplimiento en tipado (`mypy --strict`) y paso exitoso de tests unitarios.

**Próximos Pasos:**
Completar la migración de los últimos scripts en `f/` para que funcionen como módulos estándar importables sin el overhead de Windmill.
