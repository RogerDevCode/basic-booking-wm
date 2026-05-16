# PLAN: Mitigación LAW-09 — Error Dicts → Excepciones
**Creado:** 2026-05-15  
**Prioridad:** ALTO-1  
**Objetivo:** Eliminar `return {"success": False, ...}` del hot-path y reemplazar por excepciones tipadas, manteniendo la integración con Windmill flow.yaml.

---

## DIAGNÓSTICO PREVIO AL PLAN

### El problema real tiene DOS capas distintas:

**Capa A — Módulos Windmill que comunican resultado al flow.yaml**  
Estos módulos son **steps de un flow**. Windmill los llama, lee su output, y decide el siguiente paso vía `skip_if`. El output es parte del contrato con el flow.yaml.

Módulos afectados:
- `f/internal/booking_confirm/main.py` → `flow.yaml` lee `results.booking_commit.success`, `.error`, `.user_message`
- `f/internal/booking_prefetch/main.py` → `flow.yaml` lee `results.booking_prefetch.items`, `.block_reason`

**Capa B — Lógica interna que retorna error dicts entre funciones Python**  
Estas son funciones internas que se llaman entre sí. No hay flow.yaml de por medio. Aquí LAW-09 aplica sin restricciones.

Módulos afectados:
- `f/booking_orchestrator/main.py` → `return {}` en fallback
- `f/booking_orchestrator/handlers/_create.py`, `_reschedule.py`, `_list_available.py`
- `f/internal/ai_agent/main.py`
- `f/services/booking/orchestrator.py`

---

## ESTRATEGIA

### Para Capa A (Windmill steps): Mitigation, no full rewrite
LAW-09 dice FAIL → EXCEPTION. Pero en Windmill, si un step lanza excepción no controlada, el flow entero falla y va al `failure_module`. El usuario recibe un mensaje genérico de error.

El problema real en `booking_confirm` no es que use dicts — es que **usa dicts para enmascarar fallos que deberían ser excepciones, y el flow continúa procesando pasos siguientes con datos inválidos**.

**Estrategia correcta para Capa A:**
1. Extraer la lógica de negocio a funciones internas que usan excepciones (LAW-09 puro)
2. El `main()` del step captura las excepciones tipadas y las convierte a output estructurado **solo en el boundary Windmill**
3. Usar Pydantic models para el output (LAW-07), no dicts crudos
4. Eliminar los `return {"success": False}` dentro de la lógica interna

### Para Capa B (lógica interna Python): Full LAW-09
Excepciones directas. Sin dicts de error. Sin status objects.

---

## EXCEPCIONES TIPADAS A CREAR

Nuevo archivo: `f/internal/_booking_errors.py`

```python
class BookingError(RuntimeError):
    """Base para todos los errores de dominio de booking."""

class SlotUnavailableError(BookingError):
    """El slot ya fue reservado."""

class ClientOverlapError(BookingError):
    """El cliente ya tiene una cita en ese horario."""

class ClientAlreadyBookedError(BookingError):
    """El cliente ya tiene una cita activa."""

class NoServiceForProviderError(BookingError):
    """El proveedor no tiene servicios activos."""

class MissingParametersError(BookingError):
    """Parámetros requeridos ausentes."""

class PrefetchBlockedError(BookingError):
    """Prefetch bloqueado por condición de negocio."""
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
```

---

## FASES DE IMPLEMENTACIÓN

---

### FASE 1: Crear excepciones tipadas
**Archivo:** `f/internal/_booking_errors.py` (nuevo)  
**Riesgo:** Cero — solo crea tipos, no modifica nada.  
**Tests:** Ninguno requerido.

---

### FASE 2: Refactorizar `booking_confirm` (Capa A)

**Cambios:**

1. Extraer `_confirm_booking_core()` como función async que **lanza excepciones** en vez de retornar dicts de error.

2. Definir output model Pydantic:
```python
class BookingConfirmOutput(BaseModel):
    success: bool
    booking_id: str | None = None
    booking_short_id: str | None = None
    provider_name: str | None = None
    service_name: str | None = None
    start_time: str | None = None
    user_message: str | None = None
    error: str | None = None
```

3. `main()` llama a `_confirm_booking_core()`, captura `BookingError` → construye output con `success=False`, deja propagar excepciones inesperadas (el flow las captura en `failure_module`).

**Antes:**
```python
# 8 return {"success": False, ...} dispersos en lógica interna
if not client_id:
    return {"success": False, "error": "missing_parameters", ...}
```

**Después:**
```python
# Lógica interna: solo excepciones
async def _confirm_booking_core(...) -> BookingConfirmSuccess:
    if not client_id:
        raise MissingParametersError("client_id, provider_id, start_time requeridos")
    ...

# Boundary Windmill: captura tipada → output estructurado
def main(...) -> dict[str, object]:
    try:
        result = asyncio.run(_main_async(...))
        return result.model_dump()
    except BookingError as e:
        return BookingConfirmOutput(success=False, error=str(e), user_message=_user_message(e)).model_dump()
    # excepciones inesperadas propagan → failure_module
```

**Tests requeridos:** Verificar que `_confirm_booking_core` lanza las excepciones correctas en cada rama.

---

### FASE 3: Refactorizar `booking_prefetch` (Capa A)

El caso especial aquí es `block_reason="already_booked"`. El flow.yaml lee este campo para mostrar mensaje al router. Mantener el contrato de output pero limpiar la lógica interna.

**Estrategia:**
- `PrefetchBlockedError(reason="already_booked")` dentro de la lógica
- `main()` captura y convierte a `{"items": [], "block_reason": "already_booked"}`
- Eliminar los `return {"items": [], ...}` dispersos dentro de funciones internas

**Output model:**
```python
class PrefetchOutput(BaseModel):
    items: list[dict[str, object]]
    prefetch_type: str | None
    block_reason: str | None = None
    resolved_specialty_id: str | None = None
    resolved_doctor_id: str | None = None
```

---

### FASE 4: Refactorizar handlers de orchestrator (Capa B)

**Archivos:**
- `f/booking_orchestrator/handlers/_create.py`
- `f/booking_orchestrator/handlers/_reschedule.py`
- `f/booking_orchestrator/handlers/_list_available.py`
- `f/booking_orchestrator/main.py`

**Cambios:**
- `return {}` → `raise RuntimeError(...)` con mensaje descriptivo
- `return {"success": False, ...}` → `raise BookingError(...)`
- El caller (`main.py`) captura y decide respuesta

**Riesgo:** MEDIO — estos handlers son llamados por `f/internal/telegram_router` que puede asumir dicts.

---

### FASE 5: Refactorizar `ai_agent` (Capa B)

`return {"success": False, "error_code": "VALIDATION_ERROR"}` → `raise ValidationError(...)` con código.

**Riesgo:** BAJO — ai_agent es llamado desde telegram_router que ya maneja excepciones.

---

### FASE 6: Verificación y deploy

```bash
uv run mypy --strict f/
uv run ruff check f/
uv run pytest -q
bash scripts/sync-fast.sh
```

---

## ORDEN DE EJECUCIÓN

```
FASE 1 → FASE 2 → FASE 3 → FASE 4 → FASE 5 → FASE 6
```

Cada fase es independientemente deployable. Si algo falla, el rollback es por fase.

---

## RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| flow.yaml rompe al cambiar output de booking_confirm | Media | Output model Pydantic mantiene mismas keys |
| telegram_router asume dict de handler | Media | Verificar contratos antes de FASE 4 |
| Tests no cubren nuevas excepciones | Alta | Agregar tests en cada fase |
| Excepciones inesperadas van a failure_module | Baja (es el comportamiento correcto) | Verificar que failure_module envía mensaje útil |

---

## CRITERIO DE DONE

- [ ] `f/internal/_booking_errors.py` creado con jerarquía de excepciones
- [ ] `booking_confirm`: 0 `return {"success": False}` en lógica interna
- [ ] `booking_prefetch`: 0 `return {"items": []}` en lógica interna
- [ ] orchestrator handlers: 0 `return {}` / `return {"success": False}`
- [ ] `uv run mypy --strict f/` → 0 errores
- [ ] `uv run pytest -q` → ≥555 tests passing
- [ ] Deploy exitoso a Windmill
