# Audit Fix Plan — booking-titanium-wm

Revalidación punto a punto de la auditoría contra el estado real del repo.
Commit HEAD: `40201a4a` (la auditoría reportaba `c8d7f745` — 5 commits atrás).

---

## Estado Real vs Auditoría

### Gates de entrega

| Gate | Auditoría dijo | Real ahora |
|------|---------------|-----------|
| pytest | ✅ 601/601 | ⚠️ **565/565** (2 tests NLU crashean en colección — regresión) |
| mypy --strict | ⚠️ 2 errores | ❌ **20 errores** en 7 archivos |
| pyright --strict | ❌ ~34 errores | ❌ **91 errores** (peor de lo estimado) |
| ruff check | ❌ 5 violaciones | ⚠️ **3 violaciones** (2 están en fix_*.py untracked) |
| ruff format | ❌ Inconsistente | ❌ **7 archivos** (5 son fix_*.py untracked) |

> [!CAUTION]
> La auditoría estimó 34 pyright errors. Real: **91**. También hay regresión de pytest: 2 tests de NLU rompen en colección.

---

## Hallazgos Validados (Punto a Punto)

### §1 — Commits/Estado del Repo ✅ CONFIRMADO

- 5 commits nuevos que no estaban en la auditoría (HEAD cambió)
- Archivos modificados unstaged: `booking_confirm/main.py`, `repo.py`, `_callback_router.py`, `test_booking_confirm.py`
- Untracked: `fix_mock_v3.py`, `fix_test_2.py`, `fix_test_4.py`, `fix_test_5.py` → **ninguno integrado**

### §2 — Gates ✅ CONFIRMADO (con correcciones)

Ver tabla arriba.

### §3 — Pyright: Categorías reales

```
33  reportUnnecessaryComparison   ← "if X is None" sobre TypedDict/BaseModel
29  reportUnnecessaryIsInstance   ← isinstance() innecesario
 3  reportMissingImports          ← módulos que no existen en disco
 3  reportCallIssue               ← firmas rotas (calendar/notifier)
 2  reportUnknownLambdaType
 2  reportAttributeAccessIssue    ← DAY_NAMES/RELATIVE_DATES no exportados
 1  reportUnusedImport
 1  reportConstantRedefinition
```

#### §3.1 — TypedDict is-None (33 errores) ✅ CONFIRMADO

Causa raíz **correcta**. Los `if result is None` sobre retornos BaseModel/TypedDict son dead code que pyright detecta.

#### §3.2 — Atributos en `object` ✅ CONFIRMADO PARCIALMENTE

`st.strftime()` / `dt.strftime()` donde el tipo es `object` — confirmado también en mypy.

### §3.3 — Errores NUEVOS no detectados por la auditoría

> [!WARNING]
> Estos errores son NUEVOS. La auditoría original no los detectó.

**reportMissingImports (3 errores):**
- `_booking_handler.py` hace imports lazy de `._registration_handler` y `._menu_handler`
- **Ambos módulos no existen en disco** (`handlers/` solo tiene `_booking_handler.py`)
- Doble violación: módulo faltante + LAW-12 (imports lazy)

**reportCallIssue (3 errores) — REGRESIÓN CRÍTICA:**
- `_callback_router.py:55` → `cancel_booking(req, repo)` — falta `calendar`, `notifier`
- `_callback_router.py:107` → `reschedule_booking(req, repo)` — falta `calendar`, `notifier`
- `booking_confirm/main.py:163` → `create_booking(input_data, repo)` — falta `calendar`, `notifier`

Causa: La refactorización S155 (desacoplar sync síncrono) **se revirtió** en commits recientes — `core.py` volvió a exigir `calendar` y `notifier` pero los call sites quedaron desactualizados.

**NLU — DAY_NAMES/RELATIVE_DATES (2 errores mypy + 2 pyright):**
- `f/nlu/_tfidf_classifier.py` importa `DAY_NAMES, RELATIVE_DATES`
- `f/nlu/_constants.py` re-exporta de `ai_agent/_constants.py`
- Esas constantes **no existen** en ningún lado → `ImportError` en runtime + crash de colección de pytest

### §4 — Estructura vs AGENTS.md ✅ CONFIRMADO

AGENTS.md documenta `src/*.py` — el proyecto usa `f/*/main.py`. Completamente desactualizado.

### §5 — Duplicación ✅ CONFIRMADO

| Duplicado | Archivos | Tamaño |
|-----------|---------|--------|
| FSM | `_fsm_machine.py` (426L) + `fsm.py` (266L) | 692L total |
| get_entity() | `_get_entity.py:15` + `repo.py:27` | Firmas distintas |
| tfidf wrapper | `ai_agent/_tfidf_classifier.py` → `nlu/_tfidf_classifier.py` | Re-export vacío |

### §6 — Modelos ✅ CONFIRMADO PARCIALMENTE

`services/booking/models.py` usa **Pydantic v2** (no TypedDict como decía la auditoría). Problemas reales:
- `DraftCore` sin `extra="forbid"`
- `SelectingDoctorState.items: list[dict[str, str]]` — dict cruzando frontera (LAW-08)

### §7 — Violaciones LAW

| Ley | Estado real |
|-----|-------------|
| LAW-01 Full type | ❌ `_booking_handler.py` retorna `Any` |
| LAW-02 mypy 0 err | ❌ 20 errores en 7 archivos |
| LAW-03 pyright 0 | ❌ 91 errores |
| LAW-04 ruff clean | ⚠️ 1 error real en prod (`B009` en `booking_confirm/main.py`) |
| LAW-05 pytest 80% | ⚠️ 565 pasan pero 2 crashean en colección |
| LAW-06 1 file 1 resp | ⚠️ FSM duplicado |
| LAW-07 Pydantic strict | ⚠️ `extra="forbid"` faltante en DraftCore |
| LAW-08 No dict cross fn | ❌ `list[dict[str,str]]` en states |
| LAW-09 FAIL=Exception | ✅ |
| LAW-10 No side-effects top | ✅ |
| LAW-11 Zero remote overhead | ✅ |
| LAW-12 Top-level imports | ❌ `_booking_handler.py` usa imports lazy dentro de funciones |
| LAW-13 One event loop | ✅ |

---

## Plan de Fix (Revisado)

### 🔴 P0 — Bloqueos de Runtime

#### P0-A: Firmas rotas en core.py (3× reportCallIssue)

`core.py` requiere `calendar: CalendarPort, notifier: NotifierPort` pero 3 call sites no los pasan.

**Opción A** (S155 completa): Eliminar `calendar`/`notifier` de `core.py`. Outbox async se encarga.
**Opción B** (rápido): Hacer `calendar`/`notifier` opcionales con `NullCalendar()`/`NullNotifier()` defaults.

Archivos: `f/services/booking/core.py`, `f/telegram_callback/_callback_router.py`, `f/internal/booking_confirm/main.py`

> [!IMPORTANT]
> **Decisión requerida:** ¿Opción A (arquitectura correcta, S155 completa) u Opción B (deuda técnica, operativo rápido)?

#### P0-B: DAY_NAMES / RELATIVE_DATES no existen

`_tfidf_classifier.py` los importa → `ImportError` runtime + crash pytest colección.

Fix: Definir `DAY_NAMES` y `RELATIVE_DATES` en `f/internal/ai_agent/_constants.py` y reexportarlas en `f/nlu/_constants.py`.

#### P0-C: Módulos faltantes (_registration_handler, _menu_handler)

`_booking_handler.py` importa lazy dos módulos que no existen → `ImportError` garantizado en ese code path.

Fix: Crear los módulos con los símbolos esperados y mover imports al top-level (LAW-12).

Archivos: `handlers/_registration_handler.py` [NEW], `handlers/_menu_handler.py` [NEW], `_booking_handler.py` [MODIFY]

---

### 🟠 P1 — Dead Code Masivo (62 errores pyright)

33 `reportUnnecessaryComparison` + 29 `reportUnnecessaryIsInstance` en ~30 archivos.

Patrón a eliminar en cada archivo:
```python
# MUERTO — las funciones ya lanzan excepciones
result = service_call()
if result is None:
    raise RuntimeError(...)
if isinstance(result, dict):
    ...
```

Archivos afectados: `admin_honorifics`, `auth_provider`, `availability_check`, `booking_orchestrator/handlers/`, `booking_search`, `booking_wizard`, `circuit_breaker`, `conversation_logger`, `distributed_lock`, `gcal_reconcile`, `gcal_sync`, `gmail_send`, `health_check`, `internal/ai_agent`, `internal/booking_fsm`, `internal/scheduling_engine`, `internal/_nlu_cache`, `noshow_trigger`, `openrouter_benchmark`, `patient_register`, `provider_manage`, `rag_query`, `reminder_config`, `reminder_cron`, `telegram_auto_register`, `telegram_callback`, `telegram_gateway`, `telegram_send`

> [!NOTE]
> Automatizable con script pyright-targeted. Cada archivo tiene 1-3 instancias del mismo patrón.

---

### 🟡 P2 — Type Safety Residual

**P2-A:** `_booking_handler.py` — mover imports lazy al top-level, corregir retorno `Any → RouterResult` (resuelto parcialmente por P0-C)

**P2-B:** `booking_confirm/main.py:182` — ruff B009:
```python
# Antes
booking_id = str(getattr(result, "booking_id"))
# Después
booking_id = str(result.booking_id)
```

---

### 🟠 P3 — Consolidación

**P3-A:** FSM duplicado → Eliminar `f/services/booking/fsm.py`, redirigir todo a `f/internal/booking_fsm/`

**P3-B:** `get_entity()` duplicado → Mantener `_get_entity.py` (firma estricta), eliminar de `repo.py`

**P3-C:** tfidf wrapper → Eliminar `ai_agent/_tfidf_classifier.py` (re-export vacío que causó P0-B), imports directos a `nlu/_tfidf_classifier.py`

---

### 🟢 P4 — Hygiene

**P4-A:** Eliminar archivos untracked: `fix_mock_v3.py`, `fix_test_2.py`, `fix_test_4.py`, `fix_test_5.py`

**P4-B:** Agregar `extra="forbid"` a `DraftCore`

**P4-C:** Actualizar AGENTS.md: reemplazar `src/*.py` con `f/*/main.py`

---

## Orden de Ejecución

```
P0-B → P0-D → P0-C → P0-A   # Runtime fixes (con decisión arquitectónica en P0-A)
P1-A                           # Script masivo dead code
P2-A → P2-B                   # Type safety residual
P3-C → P3-B → P3-A            # Consolidación (de menor a mayor riesgo)
P4-A → P4-B → P4-C            # Hygiene
```

## Estimación Revisada

| Prioridad | Items | Tiempo |
|-----------|-------|--------|
| 🔴 P0 | A, B, C, D | 2-4h |
| 🟠 P1 | dead code masivo | 2-3h (script) |
| 🟡 P2 | type safety | 1h |
| 🟠 P3 | consolidación | 3-4h |
| 🟢 P4 | hygiene | 0.5h |

**Total: ~2 días de trabajo enfocado.**
