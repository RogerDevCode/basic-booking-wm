# AGENTS.md — PYTHON BOOKING OPS v4.0

## MISSION

ROLE: SR-PY/BACKEND ENG  
OBJ : BUILD/MAINTAIN BOOKING SYS  
MODE: STATIC-STRICT (Go-Style) / ZERO-AMBIGUITY  

---

## ABSOLUTE LAWS (ALL MUST PASS)

LAW-01  FULL TYPE COVERAGE → VAR/PARAM/RETURN  
LAW-02  mypy --strict = 0 ERR (Go-Style Rigidity)
LAW-03  pyright --strict = 0 ERR  
LAW-04  ruff clean + formatted  
LAW-05  pytest pass + ≥80% LOGIC  
LAW-06  1 FILE = 1 RESPONSIBILITY  
LAW-07  Pydantic v2 @ BOUNDARIES ONLY (Validation ≠ Type Enforcement)
LAW-08  NO dict CROSSING FN BOUNDARIES  
LAW-09  FAIL = EXCEPTION (NO STATUS OBJECTS)  
LAW-10  NO SIDE-EFFECTS @ TOP LEVEL  
LAW-11  EXCEPT = LOG + RAISE → NO silent swallow, NO error dict return  
LAW-12  FSM-SAFE BY DEFAULT → Fallback de orquestación a FSM si IA falla.
LAW-13  HYBRID EXTRACTION OVER LLM → Extraer datos vía Python primero.
LAW-14  BANNED-13: "CITA" IN USER MESSAGES → Siempre usar "hora" o "reserva".

---

## STACK

PYTHON: 3.13 (MANDATORY EXCLUSIVITY)  
PKG   : uv  
LINT  : ruff  
TYPE  : mypy + pyright (Static Safety over Runtime Enforcement)
TEST  : pytest  
DATA  : pydantic v2 (Strict mode at I/O boundaries)
FLOW  : returns  
QUEUE : arq (Redis)  
DB    : postgresql (asyncpg)

---

## STATIC CONFIGURATION (GO-STYLE)

Para lograr la rigidez de Go, delegamos la seguridad al análisis estático en tiempo de desarrollo y CI-CD, eliminando penalizaciones en ejecución:

```toml
[tool.mypy]
strict = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true
warn_return_any = true
```

---

## TYPE SYSTEM

HEADER:
from __future__ import annotations  

RULES:
- USE list[T] dict[K,V] T|None  
- NO Any IN PUBLIC API  

CONST:
from typing import Final  

---

## DATA BOUNDARIES

class BookingIn(BaseModel):
  model_config = ConfigDict(strict=True)
  user_id: str
  date: str
  slot: str

RULE:
- Validar entrada/salida en los bordes del sistema.
- Confiar en el tipado estático dentro de la lógica interna.

---

## PURE LOGIC LAYER

RULE:
- INTERNAL → Result[T,E]  
- EXTERNAL → raise Exception  
- NO runtime type guards (@beartype is BANNED).

---

## ERROR MODEL

SUCCESS → VALUE  
FAIL    → Failure(E)  

MAIN:
match result:
  Success → return  
  Failure → raise RuntimeError  

---

## EXCEPTION BUBBLING (FAIL-FAST MANDATORY)

PRINCIPLE: Every `except` block MUST log AND re-raise. No silent swallowing.

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
- ZERO RUNTIME TYPE OVERHEAD
- CONNECTION POOLING (Redis/Postgres)

---

## PROMPT ENGINE

> **HEART OF THE LAWS:** every law exists to collapse ambiguity *before* runtime. Static types + validated boundaries + fail-fast make the error *unrepresentable*. Determinism is error-prevention.

---

## DEV CONTEXT & SYNTHESIS (MAY 2026)

**Última Actualización:** Transición a Seguridad Estática Estilo Go (Mayo 2026).

**Estado Actual del Sistema:**
1. **Seguridad Estática:** Eliminado el uso de `beartype` y casteos forzados en runtime. La seguridad ahora reside 100% en `mypy --strict` y `pyright --strict`.
2. **Arquitectura Independiente:** Sistema operando con FastAPI y Arq.
3. **Localización de Jerga ("Cita" → "Hora"):** Erradicado el término "cita".
4. **Eficiencia en Red:** Uso de `httpx` asíncrono y Pool Global de Redis.

**Próximos Pasos:**
Remover `beartype` de las dependencias y limpiar decoradores residuales en la capa de lógica.
