# PLAN FINAL: LAW-09 — Error Dicts → Excepciones
**Versión:** 2.0 (post red-team)  
**Fecha:** 2026-05-15  
**Estado:** APROBADO — incorpora correcciones del análisis adversarial

---

## VALIDACIÓN DE CRÍTICAS DEL RED TEAM

| ID | Crítica | Verificado | Decisión |
|---|---|---|---|
| C1 | Jerarquía duplicada — ya existe `_booking_errors.py` | ✅ CORRECTO | Usar el existente, no crear nuevo |
| C2 | `f/services/booking/orchestrator.py` ignorado (15+ error dicts) | ✅ CORRECTO | Incluido como Capa C |
| C3 | Side-effects (DLQ) en error paths sin plan de migración | ✅ CORRECTO | Estrategia explícita en FASE 2 |
| C4 | `return {}` en orchestrator son legítimos, no violations | ✅ CORRECTO | Reclasificados, excluidos del scope |
| H2 | booking_prefetch: cero tests — refactorizar sin tests es negligencia | ✅ CORRECTO | Tests de caracterización primero (FASE 0) |
| H3 | `import traceback` lazy en booking_prefetch:244 — LAW-12 | ✅ CORRECTO | Corregir en FASE 3 |
| M1 | `if True:` dead code en booking_orchestrator/main.py:136 | ✅ CORRECTO | Limpiar en FASE 4 |
| M3 | telegram_gateway y message_parser también violan LAW-09 | ✅ CORRECTO | Incluidos como Capa D |
| A8 | "≥555 tests" arbitrario | ❌ INCORRECTO | 555 es el count real de pytest (validado) |
| F6 | "De 284 a 555 son 271 tests nuevos" | ❌ INCORRECTO | El red team usó count desactualizado (284) |

---

## INVENTARIO REAL DE VIOLATIONS

Resultado del grep exhaustivo tras red-team:

| Archivo | Error dicts | `return {}` legítimos | En scope |
|---|---|---|---|
| `f/internal/booking_confirm/main.py` | 6 | 0 | ✅ Capa A |
| `f/internal/booking_prefetch/main.py` | 2 + 5 retornos de datos (legítimos) | 0 | ✅ Capa A |
| `f/services/booking/orchestrator.py` | 15+ | 0 | ✅ Capa C (nuevo) |
| `f/telegram_gateway/main.py` | 1 | 0 | ✅ Capa D (nuevo) |
| `f/internal/message_parser/main.py` | 1 | 0 | ✅ Capa D (nuevo) |
| `f/internal/ai_agent/main.py` | 2 | 0 | ✅ Capa B |
| `f/booking_orchestrator/main.py` | 0 | 2 (legítimos) | ❌ Excluido |
| `f/booking_orchestrator/handlers/` | Via OrchestratorResult | 0 | Revisar post-C |

---

## CONTRATOS OUTPUT → CONSUMER (documentados antes de tocar código)

### booking_confirm → flow.yaml (Windmill)
Campos consumidos vía JS expressions:
```
results.booking_commit?.success        → boolean gate
results.booking_commit.service_name   → string en mensaje
results.booking_commit.provider_name  → string en mensaje
results.booking_commit.booking_short_id → string en mensaje
results.booking_commit?.error          → boolean gate
results.booking_commit.user_message   → string en mensaje
```
**Regla:** El output model final DEBE incluir exactamente estos campos. Nada más, nada menos.

### booking_prefetch → flow.yaml (Windmill) y → router
Campos consumidos:
```
results.booking_prefetch.items           → array, pasado al router
results.booking_prefetch.block_reason    → string | null, pasado al router
```
Campos `prefetch_type`, `resolved_specialty_id`, `resolved_doctor_id` — **NO son consumidos por flow.yaml**. Son para el router interno. Evaluar si router los usa realmente.

---

## JERARQUÍA DE EXCEPCIONES (sin duplicar)

**Usar y extender `f/services/booking/_booking_errors.py`** — archivo existente.

Agregar las excepciones que faltan:

```python
# Existentes (NO tocar):
BookingNotFoundError
BookingAlreadyCancelledError
BookingAlreadyRescheduledError
BookingSlotUnavailableError
BookingPermissionError

# Nuevas a agregar:
class BookingClientOverlapError(BookingError): ...       # ya tiene cita en ese horario
class BookingClientAlreadyActiveError(BookingError): ... # ya tiene cita activa
class BookingNoServiceError(BookingError): ...           # proveedor sin servicios activos
class BookingMissingParamsError(BookingError): ...       # parámetros requeridos ausentes
class BookingPrefetchBlockedError(BookingError):         # prefetch bloqueado
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
```

**Base común necesaria:**
```python
class BookingError(RuntimeError): ...
# Todas las existentes deben heredar de BookingError para facilitar catch genérico
```

---

## FASES DE IMPLEMENTACIÓN

---

### FASE 0 — Tests de caracterización para booking_prefetch
**Por qué primero:** booking_prefetch tiene 262 líneas, lógica FSM compleja, y CERO tests. Refactorizarlo sin cobertura es negligencia confirmada por el red team.

**Entregables:**
- `tests/test_booking_prefetch_characterization.py`
- Cubrir: estado `idle`, `selecting_doctor`, `selecting_slot`, `already_booked`, `DB error`
- Mockear: `create_db_client`, resultados de `db.fetch`/`db.fetchrow`
- **No modificar** código de producción en esta fase

**Criterio de done:** ≥8 tests que pasan y documentan el comportamiento actual (aunque sea el comportamiento erróneo).

---

### FASE 1 — Extender jerarquía de excepciones existente
**Archivo:** `f/services/booking/_booking_errors.py`  
**Riesgo:** Cero — solo agrega, no modifica.

**Cambios:**
1. Agregar base `BookingError(RuntimeError)` si no existe
2. Hacer que las existentes hereden de `BookingError`
3. Agregar las 5 nuevas excepciones listadas arriba
4. Agregar tests en `tests/test_booking_errors.py` — verificar herencia y mensajes

**Criterio de done:** `uv run mypy --strict f/services/booking/_booking_errors.py` = 0 errores. Tests de herencia pasan.

---

### FASE 2 — Refactorizar `booking_confirm` (Capa A)

**Problema central del red team resuelto:** DLQ y side-effects.

**Estrategia para side-effects:**
- El DLQ insert pertenece al **error path de infraestructura** (fallo de DB), NO al error path de negocio (slot tomado, parámetros faltantes).
- Errores de negocio (`BookingError`) → NO van al DLQ. El usuario recibe mensaje específico.
- Errores de infraestructura (`Exception` genérica) → SÍ van al DLQ. El usuario recibe mensaje genérico.
- Esta distinción ya estaba implícita pero nunca codificada. La refactorización la hace explícita.

**Output model Pydantic (contrato exacto con flow.yaml):**
```python
class BookingConfirmOutput(BaseModel):
    success: bool
    booking_short_id: str | None = None
    provider_name: str | None = None
    service_name: str | None = None
    user_message: str | None = None
    error: str | None = None
```

**Estructura después de refactorizar:**
```python
async def _confirm_booking_core(...) -> BookingConfirmSuccess:
    # Solo excepciones. Cero return de error dicts.
    if not client_id:
        raise BookingMissingParamsError("client_id requerido")
    ...
    # Lanza BookingClientAlreadyActiveError, BookingSlotUnavailableError, etc.

def main(...) -> dict[str, object]:
    try:
        result = asyncio.run(_main_async(...))
        return BookingConfirmOutput(success=True, **result).model_dump()
    except BookingError as e:
        # Error de negocio → usuario recibe mensaje específico, NO va al DLQ
        return BookingConfirmOutput(
            success=False,
            error=str(e),
            user_message=_user_message(e)
        ).model_dump()
    except Exception as e:
        # Error de infraestructura → DLQ + mensaje genérico
        _insert_dlq(...)
        return BookingConfirmOutput(
            success=False,
            error=str(e),
            user_message=_user_message(e)
        ).model_dump()
```

**Tests requeridos:** Verificar que cada tipo de error lanza la excepción correcta desde `_confirm_booking_core`.

---

### FASE 3 — Refactorizar `booking_prefetch` (Capa A)

**Prerequisito:** FASE 0 completada (tests de caracterización).

**Aclaración de campos:**
- `prefetch_type`, `resolved_specialty_id`, `resolved_doctor_id` — verificar si el router los usa.
  - Si SÍ: mantener en output (documentar como contrato interno router)
  - Si NO: eliminar (M2 del red team)
- Output model solo incluirá campos verificados como consumidos.

**Estrategia para `block_reason`:**
```python
# Antes: return {"items": [], "block_reason": "already_booked"} en lógica interna
# Después:
async def _fetch_items(...) -> list[...]:
    if active_booking:
        raise BookingPrefetchBlockedError("already_booked")
    ...

# En main():
except BookingPrefetchBlockedError as e:
    return PrefetchOutput(items=[], block_reason=e.reason).model_dump()
```

**Fix adicional (red team H3):** Mover `import traceback` de línea 244 al top-level.

---

### FASE 4 — Refactorizar `f/services/booking/orchestrator.py` (Capa C)

**Mayor violador ignorado en el plan original. 15+ error dicts.**

Este archivo es lógica Python pura (no es step de Windmill directamente). LAW-09 aplica sin restricciones.

**Patrón de refactorización:**
```python
# Antes:
if not booking_id:
    return {"action": "cancelar_cita", "success": False, "message": "❌ Necesito el ID"}

# Después:
if not booking_id:
    raise BookingMissingParamsError("booking_id requerido para cancelar")
```

**El caller (telegram_router) ya maneja excepciones.** Los handlers retornan éxito o lanzan — el router captura y construye respuesta.

**Limpiar dead code (red team M1):**
```python
# Eliminar:
if True:  # patched unnecessary isinstance
    return cast("dict[str, object]", result)
else:
    return {"data": result}  # dead

# Reemplazar por:
return cast("dict[str, object]", result)
```

---

### FASE 5 — Refactorizar Capa D: telegram_gateway y message_parser

**Casos simples — 1 violation cada uno.**

```python
# telegram_gateway/main.py:67
# Antes:
return {"success": False, "error": f"validation_error: {e}"}
# Después:
raise RuntimeError(f"validation_error: {e}") from e

# message_parser/main.py:36
# Antes:
return {"success": False, "error": f"validation_error: {e}"}
# Después:
raise RuntimeError(f"validation_error: {e}") from e
```

Verificar que los callers de estos módulos manejan la excepción.

---

### FASE 6 — Refactorizar `ai_agent` (Capa B)

```python
# Antes:
return {"success": False, "data": None, "error_code": "VALIDATION_ERROR", ...}
# Después:
raise ValueError(f"VALIDATION_ERROR: {e}") from e
```

---

### FASE 7 — Verificación integral y deploy

```bash
uv run mypy --strict f/
uv run ruff check f/
uv run pytest -q  # target: ≥555 (count real actual)
bash scripts/sync-fast.sh
```

---

## ORDEN DE EJECUCIÓN

```
FASE 0 (tests prefetch)
  → FASE 1 (extender _booking_errors.py)
    → FASE 2 (booking_confirm) ─┐
    → FASE 3 (booking_prefetch) ┼─ paralelo posible
    → FASE 4 (services/booking/orchestrator.py)
    → FASE 5 (gateway + parser) ─┘
    → FASE 6 (ai_agent)
      → FASE 7 (verificación + deploy)
```

Fases 2–6 son independientes entre sí. La única dependencia es FASE 0 → FASE 3 y FASE 1 → todas.

---

## CRITERIO DE DONE

- [ ] `f/services/booking/_booking_errors.py` extendido con 5 nuevas excepciones + base `BookingError`
- [ ] `booking_confirm`: 0 `return {"success": False}` dentro de lógica interna; boundary captura por tipo
- [ ] `booking_prefetch`: 0 `return {"items": []}` en lógica interna; `import traceback` top-level
- [ ] `f/services/booking/orchestrator.py`: 0 `return {"success": False, ...}` — todo es raise
- [ ] `telegram_gateway`, `message_parser`: 0 error dicts — raise directo
- [ ] `ai_agent`: 0 error dicts
- [ ] Dead code `if True:` eliminado de `booking_orchestrator/main.py`
- [ ] Contratos output → consumer documentados y respetados por Pydantic models
- [ ] `uv run mypy --strict f/` → 0 errores
- [ ] `uv run pytest -q` → ≥555 tests passing
- [ ] Deploy exitoso a Windmill sin regresiones en flow.yaml
