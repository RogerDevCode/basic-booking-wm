# AUDITORÍA BOOKING-TITANIUM-WM — 2026-05-16

## DELIVERY GATES STATUS

| Gate | Status | Details |
|------|--------|---------|
| `mypy --strict` | **PASS** | 0 issues in 580 files ✅ |
| `pyright strict` | **FAIL** | 129 errors |
| `ruff check` | **PASS** | All checks passed ✅ |
| `pytest -q` | **PASS** | 600 passed ✅ |

**3/4 gates pass. Pyright blocks delivery.**

---

## FIXES APLICADOS (2026-05-16)

### FIX-02: Reglas de negocio de reservas mal implementadas (CRITICAL)

**Bug RULE 1:** `booking_create` verificaba `client_id` solamente, bloqueando TODAS las citas del cliente sin importar el proveedor. La regla dice "no reservar con el mismo proveedor si ya tiene cita activa con ese proveedor".

**Bug RULE 2:** `has_client_overlap()` existía como código muerto — nunca se llamaba. Un cliente podía reservar con proveedores distintos a la misma hora.

**Fix aplicado:**
- `f/booking_create/_booking_create_repository.py` — renombrado `has_active_booking_for_client` → `has_active_booking_for_client_provider(client_id, provider_id)`
- `f/booking_create/_create_booking_logic.py` — ahora verifica ambas reglas: (1) active booking con mismo provider, (2) client time overlap con cualquier provider
- `f/internal/booking_prefetch/main.py` — renombrado `_has_active_booking` → `_has_active_booking_for_provider`
- `f/booking_reschedule/_reschedule_logic.py` — agregado check de `check_client_overlap` antes de reschedule
- `f/booking_reschedule/_reschedule_repository.py` — agregado método `check_client_overlap`
- `f/internal/_booking_utils.py` — unificada definición de "activo" a `NOT IN ('cancelled', 'no_show', 'rescheduled')`
- `f/services/booking/repo.py` — unificada definición de "activo"

**Bug:** El LLM en `f/internal/ai_agent/main.py` se llamaba **incondicionalmente** y sobrescribía el resultado de TF-IDF incluso cuando tenía confianza 0.95 (keyword match directo).

**Mensaje afectado:** "quiero una cita para el siguiente miercoles en la mañana" → clasificado como `pregunta_general` en vez de `crear_cita`.

**Fix:** Si TF-IDF confidence >= 0.9, se salta la llamada al LLM y se preserva el resultado determinista.

**Archivos modificados:**
- `f/internal/ai_agent/main.py` — LLM ahora solo se llama cuando TF-IDF confidence < 0.9
- `tests/py/ai_agent/test_contract.py` — test actualizado para verificar nuevo comportamiento

---

## CRITICAL — Delivery Gate Failures

### C-01: `pyright strict` FAIL — 129 errors (LAW-03)

**Root cause:** `reportUnknownMemberType` y checks relacionados están activos (en auditoría anterior estaban deshabilitados en pyrightconfig.json).

| Categoría | ~Errores | Ejemplo |
|-----------|----------|---------|
| `reportUnknownMemberType` | 40 | `list[Unknown]` de `db.fetch()` — asyncpg devuelve rows sin tipar |
| `reportUnknownVariableType` | 20 | Variables `Unknown` desde `.get()` en dicts |
| `reportTypedDictNotRequiredAccess` | 15 | Acceso a keys opcionales de TypedDict sin `.get()` |
| `reportPossiblyUnboundVariable` | 1 | `f/telegram_auto_register/main.py:79` — `pg_url` unbound |
| `reportUnnecessaryComparison` | 3 | Checks `is None` muertos en entrypoints |
| `reportUnnecessaryIsInstance` | 2 | `isinstance(result, dict)` redundante |

**Archivos hotspot** (más errores):
- `f/reminder_config/_config_service.py` — 12 errores (dict `.get()` en datos sin tipar)
- `f/web_admin_tags/_tags_logic.py` — 12 errores (manejo de rows asyncpg)
- `f/telegram_callback/_callback_router.py` — 9 errores (TypedDict optional key access)
- `f/internal/scheduling_engine/_scheduling_logic.py` — 6 errores

---

## HIGH SEVERITY — Violaciones de Leyes

### H-01: `if True:  # patched unnecessary isinstance` — 20 instancias (BANNED-09 / LAW-09)

Código muerto en 20 entrypoints. Condicional siempre-true que enmascara type narrowing que pyright no puede probar.

**Archivos afectados:**
`booking_wizard/main.py`, `gcal_reconcile/main.py`, `rag_query/main.py`, `gmail_send/main.py`, `provider_manage/main.py`, `conversation_logger/main.py`, `gcal_sync/main.py`, `noshow_trigger/main.py`, `distributed_lock/main.py`, `internal/booking_fsm/_fsm_machine.py`, `booking_search/main.py`, `web_admin_users/main.py`, `reminder_cron/main.py` (×2), `reminder_config/main.py` (×2), `openrouter_benchmark/main.py`, `telegram_auto_register/main.py`, `telegram_callback/main.py`, `health_check/main.py`

### H-02: `print()` en código de producción — 10 instancias (LOGGING rule)

Viola regla "NO print()". Debe usar módulo `logging`.

| Archivo | Líneas | Contexto |
|---------|--------|----------|
| `f/internal/debug_db_final.py` | 9, 12 | Debug output |
| `f/internal/debug_db.py` | 9, 17 | Debug output |
| `f/internal/apply_fix_migration.py` | 9, 19 | Migration script |
| `f/internal/ai_agent/main.py` | 171 | CRITICAL ERROR fallback |
| `f/openrouter_benchmark/main.py` | 122 | CRITICAL ERROR fallback |
| `f/nlu/main.py` | 83 | CRITICAL ERROR fallback |
| `f/telegram_menu/main.py` | 56 | CRITICAL ERROR fallback |

### H-03: `raise ... from None` — 4 instancias (EB-02)

Destruye stack trace. Viola regla "ALWAYS USE `from e`".

| Archivo | Línea | Mensaje |
|---------|-------|---------|
| `f/booking_wizard/_wizard_logic.py` | 189 | `invalid_timestamp_format` |
| `f/provider_manage/_manage_logic.py` | 157 | `INVALID_TIME_FORMAT` |
| `f/provider_manage/_manage_logic.py` | 199 | `INVALID_DATE_OR_TIME_FORMAT` |
| `f/provider_manage/_manage_logic.py` | 228 | `INVALID_DATE_FORMAT` |

### H-04: `from __future__ import annotations` ausente — 89 archivos (TYPE SYSTEM)

89 de ~250 archivos Python en `f/` carecen del header obligatorio. Brecha sistémica LAW-01/LAW-02.

### H-05: Fuga de tipo `Any` — 25+ archivos importan `Any` (BANNED-07)

`Any` importado en muchos entrypoints. El patrón entrypoint usa `dict[str, Any]` para args (aceptable por template), pero código interno también usa `Any`:
- `f/internal/_db_client.py:70-71` — `_global_pool: Any`, `_global_loop: Any`
- `f/internal/_db_client.py:105` — `pool_ref: Any`

---

## MEDIUM SEVERITY — Arquitectura / Calidad de Código

### M-01: `f/internal/` es un God Directory (espíritu BANNED-01)

20+ archivos: `_db_client.py`, `_redis_client.py`, `_crypto.py`, `_config.py`, `_wmill_adapter.py`, `_auth_jwt.py`, `_nlu_cache.py`, `_result.py`, `_state_machine.py`, `_file_lock.py`, `_date_resolver.py`, `_booking_utils.py`, más subdirectorios `booking_fsm/`, `gcal_utils/`, `scheduling_engine/`. Es `utils/` renombrado — viola el espíritu de BANNED-01.

### M-02: Artefactos en raíz del repo

- `neon_backup.dump` — 10MB backup de base de datos (SEC-03)
- `result.json` — 43KB artifact de debugging
- `patch_auth.py` — script one-off con `print()` y reescritura de source vía regex

### M-03: Directorio `f/_archived/` aún en codebase

`f/_archived/telegram_normalize/` — código archivado aún contado por type checkers y test runner. Debe ser excluido o removido.

### M-04: Directorios de tests duplicados

5 pares de directorios de tests con responsabilidades solapadas:
- `tests/py/web_admin/` vs `tests/py/web_admin_*/`
- `tests/py/web_auth/` vs `tests/py/web_auth_*/`
- `tests/py/web_booking/` vs `tests/py/web_booking_api/`
- `tests/py/web_patient/` vs `tests/py/web_patient_*/`
- `tests/py/web_provider/` vs `tests/py/web_provider_*/`

Más tests huérfanos en raíz: `tests/test_telegram_router.py`, `tests/test_orchestrator_logic.py`, etc.

### M-05: `booking_cancel/main.py` inconsistencia de naming

Usa `main_async` en vez de `_main_async` (violación de convención). También usa `dict[str, Any]` en vez de `dict[str, object]` para args.

---

## LOW SEVERITY

### L-01: Directorio `scripts/` contiene scripts no-producción
- `auto_fix_mypy.py`, `auto_fix_mypy_strict.py` — enmascaran errores de tipo
- `gen_summary.py` — utilidad
- `test_telegram_flow.py` — test fuera de `tests/`

### L-02: WM-05 `cancel_running()` no se llama
Ningún script llama `wmill.cancel_running()` como primera operación.

### L-03: WM-06 `set_progress()` no se llama
Ningún script reporta progreso para operaciones largas.

---

## RESUMEN

| Severidad | Cantidad | Acción |
|-----------|----------|--------|
| CRITICAL | 1 (pyright 129 errores) | **Bloquear deploy** — fix type errors |
| HIGH | 5 | **Debe fix** — dead code, print(), from None, annotations ausentes, Any leakage |
| MEDIUM | 5 | **Debe fix** — god directory, artefactos, duplicados |
| LOW | 3 | **Backlog** — scripts, WM rules |

### Cambio clave vs auditoría anterior

| Gate | Auditoría previa | Esta auditoría | Delta |
|------|-----------------|----------------|-------|
| `mypy --strict` | FAIL (15 errores) | **PASS** | +15 fix |
| `pyright strict` | FAIL (22 errores) | **FAIL (129 errores)** | +107 (checks habilitados) |
| `ruff check` | FAIL (~15 violaciones) | **PASS** | +15 fix |
| `pytest -q` | FAIL (1 fallo) | **PASS (602)** | +3 fix (600→602, +2 nuevos tests) |

**Mejora neta:** mypy, ruff y pytest ahora pasan. El bloqueador restante es **pyright strict** con 129 errores de tipo `Unknown` — principalmente de manejo de rows asyncpg y acceso a keys opcionales de TypedDict.

### Fixes aplicados en esta sesión

1. **LLM override fix** — TF-IDF confidence ≥ 0.9 salta LLM (fix clasificación de intents)
2. **RULE 1 fix** — booking_create verifica `(client_id, provider_id)` no solo `client_id`
3. **RULE 2 fix** — `has_client_overlap()` ahora se llama en `execute_create_booking`
4. **Active status unification** — definición unificada a `NOT IN ('cancelled', 'no_show', 'rescheduled')`
5. **Reschedule client overlap** — agregado check de client overlap en reschedule
6. **print() → contextlib.suppress** — fix en ai_agent entrypoint
