# RED TEAM ANALYSIS: PLAN_LAW09_FIX.md

**Analista:** Adversarial Multi-Layer Review  
**Fecha:** 2026-05-15  
**Plan bajo escrutinio:** `PLAN_LAW09_FIX.md` — Mitigación LAW-09  
**Veredicto:** RECHAZADO CON OBSERVACIONES CRÍTICAS

---

## 1. DECONSTRUCCIÓN — Suposiciones del Plan

| # | Suposición del Plan | Verificación | Estado |
|---|---|---|---|
| A1 | "Capa A = Windmill steps, Capa B = lógica interna" | **CORRECTA pero INCOMPLETA**. Existe una Capa C ignorada (`f/services/booking/orchestrator.py`) | PARCIAL |
| A2 | Módulos afectados: booking_confirm, booking_prefetch, orchestrator handlers, ai_agent | **FALSA**. Faltan 6 archivos con error dicts no mencionados | FALSA |
| A3 | Necesaria nueva jerarquía en `f/internal/_booking_errors.py` | **PELIGROSA**. Ya existe `f/services/booking/_booking_errors.py` con 5 excepciones | FALSA |
| A4 | `booking_confirm` tiene 8 `return {"success": False}` dispersos | **SUBESTIMADO**. Tiene 6, pero el plan no cuenta side-effects en error paths | PARCIAL |
| A5 | `booking_prefetch` retorna error dicts que el flow.yaml lee | **CORRECTO**, pero ignora campos muertos (`prefetch_type`, `resolved_*`) | PARCIAL |
| A6 | Handlers del orchestrator retornan `{}` o `{"success": False}` | **CORRECTO**, pero ignora que handlers YA capturan excepciones y las convierten | PARCIAL |
| A7 | "Tests: Ninguno requerido" para FASE 1 | **FALSO**. Jerarquías de excepciones necesitan verificación de herencia y mensajes | FALSA |
| A8 | Criterio de done: "≥555 tests passing" | **ARBITRARIO**. Count actual es 284. Sin justificación para 555 | FALSA |

---

## 2. SUPERFICIE DE ATAQUE

### CRÍTICO — Lo que el plan NO ve

#### C1 — Jerarquía de excepciones DUPLICADA

El archivo `f/services/booking/_booking_errors.py` **YA EXISTE** y contiene:

```python
BookingAlreadyCancelledError
BookingNotFoundError
BookingPermissionError
BookingAlreadyRescheduledError
BookingSlotUnavailableError
```

El plan propone crear `f/internal/_booking_errors.py` con:

```python
SlotUnavailableError          # duplicado semántico de BookingSlotUnavailableError
ClientOverlapError            # no existe en ningún lado
ClientAlreadyBookedError      # no existe en ningún lado
NoServiceForProviderError     # no existe en ningún lado
MissingParametersError        # no existe en ningún lado
PrefetchBlockedError          # no existe en ningún lado
```

**Consecuencia:** Dos jerarquías paralelas, confusión de imports, `except BookingSlotUnavailableError` vs `except SlotUnavailableError` — bug garantizado cuando un módulo atrapa una y el código lanza la otra.

#### C2 — Capa C ignorada: `f/services/booking/orchestrator.py` (407 líneas)

Este archivo tiene **al menos 15 retornos de error dict** distribuidos en 6 handlers:

- `_handle_crear_cita` — 3 error dicts
- `_handle_cancelar_cita` — 2 error dicts
- `_handle_reagendar_cita` — 2 error dicts
- `_handle_ver_disponibilidad` — 4 error dicts
- `_handle_mis_citas` — 0 (solo éxito)
- `_handle_consultar_cita` — 2 error dicts
- `route_intent` — 1 error dict

El plan **NO lo menciona ni una sola vez**. Es el mayor violador de LAW-09 en todo el codebase.

#### C3 — Side-effects embebidos en error paths de booking_confirm

Las líneas 188-201 de `booking_confirm/main.py` ejecutan dentro del error path:

1. **DLQ insert** (Dead Letter Queue) — línea 188-189
2. **Notificación Telegram** — línea 193-201

Si refactorizas a excepciones, ¿dónde van estos side-effects? El plan dice "extraer lógica interna que usa excepciones" pero no resuelve que el boundary Windmill ahora tendría que manejar DLQ + Telegram + conversión de output. El boundary se vuelve más complejo que la lógica que envuelve.

#### C4 — `return {}` clasificado incorrectamente como LAW-09 violation

- Línea 63 de `booking_orchestrator/main.py`: `_build_default_delegates()` retorna `{}` como valor legítimo (delegados vacíos). **No es error dict.**
- Línea 132 del mismo archivo: retorna `{}` para intents no-booking como fallback intencional para que el flow use la respuesta de la IA. **Es patrón de diseño legítimo.**

El plan los clasifica como violations cuando son comportamientos intencionales.

### ALTO — Riesgos de ejecución

#### H1 — Contrato flow.yaml → booking_confirm es frágil

El flow.yaml lee `results.booking_commit?.success`, `.error`, `.user_message`, `.booking_short_id`, `.service_name`, `.provider_name` con expresiones JavaScript ternarias. Si el Pydantic output model cambia un nombre de campo o un tipo, el flow.yaml **no falla** — simplemente muestra datos vacíos al usuario. Silent failure en producción.

#### H2 — Cero tests para booking_prefetch (262 líneas)

El plan incluye FASE 3 para refactorizar prefetch pero no menciona que este módulo tiene **cero cobertura de tests**. El `block_reason="already_booked"` tiene un contrato implícito con el router que ningún test verifica. Refactorizar sin tests = cambiar código no verificado.

#### H3 — `import traceback` dentro de except blocks

Tanto `booking_confirm/main.py` (línea 243) como `booking_prefetch/main.py` (línea 244) violan LAW-12 con imports lazy de `traceback`. El plan dice "ruff clean" como criterio de done pero no los menciona.

### MEDIO

#### M1 — `if True:` dead code en `booking_orchestrator/main.py` línea 136

```python
if True:  # patched unnecessary isinstance
    return cast("dict[str, object]", result)
else:
    return {"data": result}
```

Código muerto que ruff/mypr deberían flaggear. El plan no lo menciona.

#### M2 — Campos muertos en prefetch output

`prefetch_type`, `resolved_specialty_id`, `resolved_doctor_id` se retornan pero el flow.yaml solo consume `items` y `block_reason`. El plan propone un Pydantic model que incluye estos campos muertos — perpetúa el problema.

#### M3 — `telegram_gateway/main.py` y `message_parser/main.py` también retornan error dicts

```python
# telegram_gateway/main.py:67
return {"success": False, "error": f"validation_error: {e}"}

# message_parser/main.py:36
return {"success": False, "error": f"validation_error: {e}"}
```

No están en el scope del plan pero violan LAW-09 igual.

---

## 3. RUTAS DE FALLO NO LINEALES

### Escenario 1: Colapso por doble jerarquía de excepciones

Un desarrollador importa `from f.services.booking._booking_errors import BookingSlotUnavailableError` en un handler. Otro importa `from f.internal._booking_errors import SlotUnavailableError` en otro módulo. `create_booking` lanza `BookingSlotUnavailableError`. El handler atrapa `SlotUnavailableError`. La excepción no se captura → `RuntimeError` genérico → `failure_module` → usuario ve "error interno" en vez de "horario no disponible".

**Resultado:** El usuario pierde la cita sin saber por qué. No hay log diferenciado. El equipo de soporte no puede diagnosticar.

### Escenario 2: Side-effects perdidos en la migración

Durante FASE 2, el desarrollador extrae `_confirm_booking_core()` y mueve el DLQ insert al boundary. Pero el boundary captura `BookingError` genérica y no distingue entre errores que deben ir al DLQ y los que no. Los errores de validación (`missing_parameters`) se insertan en DLQ junto con errores de infraestructura. El DLQ se llena de ruido → los errores reales se pierden → nadie detecta que `with_tenant_context` está fallando intermitentemente.

**Punto de no retorno:** Cuando el DLQ alcanza miles de falsos positivos, el equipo deja de monitorearlo. El siguiente fallo real de infraestructura pasa desapercibido durante días.

### Escenario 3: El flow.yaml se desincroniza del output model

El plan dice "Output model Pydantic mantiene mismas keys". Pero Pydantic v2 con `strict=True` rechaza tipos incompatibles. Si `booking_short_id` era `str | None` y el flow.yaml asume que siempre es string en el template de éxito, y un bug hace que llegue `None` → el JavaScript del flow.yaml concatena `null` al mensaje → el usuario ve `Ref: null-ull-ull`.

**No hay validación del output contra el contrato del flow.yaml.** El Pydantic model valida la estructura Python pero no el consumo JavaScript downstream.

---

## 4. LO AUSENTE

### Información que FALTA y por qué es peligrosa

#### F1 — No hay inventario completo de error dicts

El plan dice "módulos afectados" pero no hizo un grep exhaustivo. El inventario real:

| Archivo | Error dicts | `return {}` | Estado |
|---|---|---|---|
| `f/internal/booking_confirm/main.py` | 6 | 0 | En plan |
| `f/internal/booking_prefetch/main.py` | 2 | 0 | En plan |
| `f/internal/ai_agent/main.py` | 2 | 0 | En plan |
| `f/booking_orchestrator/main.py` | 0 | 2 (legítimos) | En plan (mal clasificado) |
| `f/booking_orchestrator/handlers/_create.py` | via OrchestratorResult | 0 | En plan |
| `f/booking_orchestrator/handlers/_reschedule.py` | via OrchestratorResult | 0 | En plan |
| `f/booking_orchestrator/handlers/_list_available.py` | via OrchestratorResult | 0 | En plan |
| `f/services/booking/orchestrator.py` | **15+** | 0 | **NO EN PLAN** |
| `f/telegram_gateway/main.py` | 1 | 0 | **NO EN PLAN** |
| `f/internal/message_parser/main.py` | 1 | 0 | **NO EN PLAN** |

Sin inventario completo, el scope es arbitrario.

#### F2 — No hay análisis de quién consume cada output

El plan asume booking_confirm → flow.yaml y prefetch → router, pero no documenta el contrato exacto de campos:

- **booking_confirm output consumido por flow.yaml:** `success`, `booking_short_id`, `service_name`, `provider_name`, `error`, `user_message`
- **booking_prefetch output consumido por flow.yaml:** `items`, `block_reason` (solo 2 de 5 campos retornados)
- **orchestrator output consumido por:** Windmill flow engine + posiblemente AI agent response

Sin este mapeo, el Pydantic output model se diseña a ojo.

#### F3 — `f/services/booking/orchestrator.py` completamente ausente

407 líneas, 15+ error dicts, es el corazón del routing de intents. Su ausencia del plan sugiere que el autor no lo conoce o lo considera "fuera de scope" sin justificación.

#### F4 — No hay estrategia de migración incremental

El plan dice "cada fase es independientemente deployable" pero FASE 2 cambia el comportamiento interno de booking_confirm. Si el output model tiene un bug, el flow.yaml rompe en producción. No hay:

- Feature flag
- Dual-write (retornar dict + lanzar excepción simultáneamente)
- Canary deployment
- Rollback automático por monitoreo

#### F5 — No hay análisis de impacto en tests existentes

Los 284 tests actuales mockean comportamientos que retornan dicts. Si cambias a excepciones:

- `TestBookingConfirmDelegation.test_successful_booking_returns_success_true` — mockea `create_booking` retornando dict
- `TestBookingConfirmDelegation.test_booking_create_failure_returns_error` — asume que la excepción se convierte a dict
- Tests de handlers del orchestrator — asumen `OrchestratorResult` con `success: bool`

El plan dice "agregar tests en cada fase" pero no cuantifica el trabajo de migrar los existentes.

#### F6 — No hay justificación para "≥555 tests"

De 284 a 555 son 271 tests nuevos. ¿De dónde sale este número? ¿Es realista para el scope del plan? Sin desglose por fase, es un target inflado que genera presión por cantidad sobre calidad.

---

## 5. VEREDITO BRUTAL

### Vulnerabilidad más crítica: Jerarquía de excepciones duplicada

El plan propone crear `f/internal/_booking_errors.py` cuando ya existe `f/services/booking/_booking_errors.py`. Esto no es un oversight menor — es un fallo de diseño arquitectónico que garantiza:

1. Confusión de imports entre equipos
2. Excepciones no capturadas por mismatch de tipo
3. Bugs en producción donde usuarios reciben mensajes genéricos en vez de específicos del dominio
4. Duplicación de mantenimiento — cada nueva excepción se crea en dos lugares

### Por qué el sistema colapsa

1. **Scope incompleto.** Ignorar `f/services/booking/orchestrator.py` (407 líneas, 15+ error dicts) significa que LAW-09 sigue violándose en el módulo más importante del sistema después de booking_confirm. El plan "resuelve" LAW-09 parcialmente mientras deja el mayor violador intacto.

2. **Estrategia de Capa A contradictoria.** Dice "Mitigation, no full rewrite" pero luego propone extraer funciones, crear Pydantic models, reescribir el boundary, y agregar tests. Eso ES un full rewrite con otro nombre.

3. **Side-effects en error paths sin plan de migración.** DLQ insert y Telegram notification están embebidos en los error paths de booking_confirm. Si los mueves al boundary, el boundary se vuelve un monolito. Si los dejas en la lógica interna, violas LAW-09. El plan no resuelve esta contradicción.

4. **Sin tests para booking_prefetch, FASE 3 es un salto al vacío.** 262 líneas de lógica de negocio con branching FSM, queries DB, timezone handling, y un contrato implícito con el router — todo sin un solo test. Refactorizar esto sin primero escribir tests de caracterización es negligencia.

5. **Confunde `return {}` legítimo con error dicts.** `_build_default_delegates()` retorna `{}` como valor válido. El orchestrator retorna `{}` para intents no-booking como fallback intencional. Clasificar estos como LAW-09 violations demuestra que el diagnóstico no distinguió entre "error enmascarado como dict" y "dict como valor de retorno legítimo".

---

## RECOMENDACIONES IMPLÍCITAS (no solicitadas, documentadas para referencia futura)

1. **Consolidar jerarquía de excepciones** en `f/services/booking/_booking_errors.py` — no crear una nueva.
2. **Incluir `f/services/booking/orchestrator.py`** en el scope o justificar explícitamente su exclusión.
3. **Escribir tests de caracterización para booking_prefetch** ANTES de refactorizar (FASE 3).
4. **Documentar contratos output → consumer** para cada módulo antes de definir Pydantic models.
5. **Distinguir explícitamente** entre error dicts (violación) y dicts legítimos (fallback, valores vacíos).
