# Mejora Módulo Recordatorios — Plan Corregido por Codex

**Fecha:** 2026-05-07  
**Estado:** Propuesto  
**Base revisada:** `docs/mejorar_menu_recordatorio.md`

---

## Veredicto

El plan original tiene buena intención, pero no está listo para implementarse como está. El mayor problema no es la UI: es la inconsistencia entre la ambición declarada y el modelo técnico propuesto.

Problemas de base:

1. Quiere preparar WhatsApp/SMS, pero sigue modelando el estado con columnas booleanas por ventana. Eso no escala por canal ni permite fallos parciales.
2. Mete `dict`, `Any`, `tuple[Exception | None, object]` y callbacks stringly-typed en zonas donde `mypy --strict` y el estilo del repo exigen contratos explícitos.
3. Mezcla recordatorios con el FSM de booking. Eso rompe la responsabilidad única y ensucia un módulo que hoy es puramente de reserva.
4. Pide quiet hours "silenciosas" sin resolver idempotencia ni reintentos. Con el cron cada 15 minutos, eso es una receta para duplicados o re-procesado ambiguo.
5. Promete edición inline "in-place", pero no aterriza el uso de `callback_message_id`, `edit_message` y los contratos del router.

Conclusión: hay que corregir el plan antes de tocar código.

---

## Enfoque Recomendado

### Opción descartada: parche mínimo

Extender el esquema actual con más columnas booleanas y meter un dispatcher genérico encima.

Por qué no:

- Es rápido pero contradictorio con el objetivo de múltiples canales.
- No resuelve fallos parciales.
- Sigue forzando `casts` y acceso dinámico por strings.
- Deja deuda estructural apenas termine esta tarea.

### Opción recomendada

Separar el problema en tres capas estrictas:

1. Configuración de preferencias del usuario.
2. Política de elegibilidad/envío por ventana.
3. Estado de dispatch por `booking + window + channel`.

Ese tercer punto es el cambio clave. Si no existe, el sistema no puede ser correcto bajo `WM-08 PARTIAL FAIL → EXPLICIT`.

---

## Principios de Diseño

1. `booking_fsm` no se toca para lógica de recordatorios. El menú de recordatorios vive en `telegram_router` y en `reminder_config`.
2. Ninguna función pública nueva acepta o retorna `dict` sin validar. En bordes: `Pydantic v2 strict`.
3. Ningún archivo mezcla persistencia, reglas y render de UI.
4. Ninguna decisión depende de strings armados con `f"{channel}_{window}"`.
5. El cron no marca una ventana como enviada si hubo error parcial.
6. Quiet hours debe dejar rastro explícito de decisión: `sent`, `skipped_quiet_hours`, `failed`.

---

## Red Team: Críticas Concretas al Plan Original

### 1. El dispatcher propuesto es prematuro y mal tipado

`DispatchRequest` en el plan original usa `buttons: list[dict[str, str]]` y `booking_details: dict[str, object] | None`. Eso viola la disciplina pedida por el repo. Además, el contrato real de `gmail_send` no coincide con `telegram_send`: uno envía `message_type` + `booking_details`, el otro manda `text` + `inline_buttons`.

Corrección:

- No hacer un "meta-dispatcher" genérico todavía.
- Introducir un servicio de entrega tipado en `reminder_cron` con modelos explícitos por canal o un `discriminated union`.

### 2. El plan invade `booking_fsm`

Extender `parse_callback_data()` en [f/internal/booking_fsm/_fsm_machine.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/booking_fsm/_fsm_machine.py:79) para soportar `rem:*` es una mala frontera. Ese parser hoy describe acciones de booking, no de preferencias.

Corrección:

- Resolver `rem:*` dentro de [f/internal/telegram_router/main.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/telegram_router/main.py:414) antes de entrar al FSM de booking.

### 3. El modelo de estado no soporta multi-canal real

Agregar `reminder_1day_sent`, `reminder_12h_sent`, `reminder_6h_sent`, `reminder_1h_sent` en `bookings` perpetúa un diseño que ya está corto.

Problema real:

- Si Telegram falla y email sale bien, una sola bandera `sent` no representa el estado.
- Si mañana se agrega WhatsApp, el esquema explota.
- No hay forma limpia de auditar `skipped_quiet_hours`.

Corrección:

- Crear una tabla de dispatch por canal y ventana.

### 4. Quiet hours está subespecificado

"Omitir silenciosamente" no basta. Silencioso para el usuario no significa invisible para el sistema. Si no persistes la decisión, el cron vuelve a intentar dentro de la ventana de matching.

Corrección:

- Persistir `status`, `decided_at`, `skip_reason`.

### 5. La UI propuesta asume contratos que hoy no existen

El router hoy modela `inline_buttons` como `list[dict[str, Any]] | None` en [f/internal/telegram_router/_router_models.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/telegram_router/_router_models.py:17). Eso no representa una inline keyboard 2D y empuja `Any` a la superficie.

Corrección:

- Tipar la UI de Telegram de forma consistente: `list[list[InlineButton]]`.

### 6. La propuesta mantiene deuda ya visible en el código actual

[f/reminder_config/main.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/reminder_config/main.py:57) ya usa `cast("Any", prefs)[key]`. El plan original empeora esa dirección en vez de cerrarla.

Corrección:

- Remplazar toggles dinámicos por funciones explícitas por `Literal`.

---

## Alcance Corregido

### Sí entra en esta iteración

1. Menú real de recordatorios vía inline keyboard.
2. Soporte de ventanas: `1day`, `24h`, `12h`, `6h`, `2h`, `1h`, `30min`.
3. Quiet hours con estado explícito.
4. Persistencia correcta por canal y ventana.
5. Tipado estricto compatible con `ruff`, `mypy --strict` y `pyright`.

### No entra en esta iteración

1. WhatsApp/SMS reales.
2. Dispatcher genérico multi-plataforma.
3. Reescritura del callback router legacy de bookings.

Nota: dejamos preparado el modelo para nuevos canales, pero no simulamos soporte inexistente.

---

## Plan Corregido

## Fase 0 — Enderezar contratos antes de agregar features

### Objetivo

Eliminar el diseño stringly-typed en la superficie de recordatorios.

### Cambios

1. Refactorizar [f/reminder_config/_config_models.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/reminder_config/_config_models.py:1) para usar `BaseModel` estrictos:
   - `ReminderChannel = Literal["telegram", "email"]`
   - `ReminderWindow = Literal["1day", "24h", "12h", "6h", "2h", "1h", "30min"]`
   - `ChannelPreferences`
   - `WindowPreferences`
   - `ReminderPreferences`
   - `ReminderConfigAction`
   - `ReminderConfigView`
2. Tipar botones inline con un modelo explícito y 2D keyboard.
3. Corregir [f/internal/telegram_router/_router_models.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/telegram_router/_router_models.py:7) para que `inline_buttons` deje de usar `Any`.

### Criterio de salida

- Cero `Any` nuevo en APIs públicas.
- Cero `dict` sin validar cruzando funciones de `reminder_config`.

---

## Fase 1 — Persistencia correcta del dispatch

### Decisión

No agregar más columnas booleanas en `bookings`.

### Migración nueva

Crear `scripts/migration_reminder_dispatches.sql` con una tabla nueva, por ejemplo:

```sql
CREATE TABLE IF NOT EXISTS booking_reminder_dispatches (
  booking_id uuid NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  reminder_window text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT NOW(),
  sent_at timestamptz NULL,
  skip_reason text NULL,
  last_error text NULL,
  PRIMARY KEY (booking_id, reminder_window, channel)
);
```

### Reglas

1. `status` permitido: `pending`, `sent`, `skipped_quiet_hours`, `failed`.
2. Un canal exitoso no tapa el fallo de otro canal.
3. La idempotencia sale del `PRIMARY KEY`, no de una docena de booleans.

### Impacto

- Se elimina la necesidad de `reminder_1day_sent`, `reminder_12h_sent`, `reminder_6h_sent`, `reminder_1h_sent`.
- Si luego llega WhatsApp, no se cambia el modelo relacional.

---

## Fase 2 — Separar responsabilidades en `reminder_config`

### Problema actual

[f/reminder_config/_config_logic.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/reminder_config/_config_logic.py:1) hoy mezcla:

- carga/guardado DB
- defaults
- render de mensajes
- mutación de preferencias

Eso viola el estilo de responsabilidad única por archivo.

### Estructura propuesta

1. `f/reminder_config/_config_models.py`
   Responsabilidad: contratos Pydantic.
2. `f/reminder_config/_config_repository.py`
   Responsabilidad: `load_preferences()` y `save_preferences()`.
3. `f/reminder_config/_config_service.py`
   Responsabilidad: reglas de toggle, defaults y validaciones.
4. `f/reminder_config/_config_view.py`
   Responsabilidad: `build_config_message()` y keyboard.
5. `f/reminder_config/main.py`
   Responsabilidad: orchestration Windmill.

### Regla crítica

Nada de `cast("Any", prefs)[key]`. El toggle debe resolverse con funciones explícitas:

- `toggle_channel(preferences, channel)`
- `toggle_window(preferences, window)`
- `deactivate_all(preferences)`
- `activate_all(preferences)`

---

## Fase 3 — Router de Telegram sin contaminar booking FSM

### Diseño

1. La opción `"3"` en [f/internal/telegram_router/main.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/telegram_router/main.py:425) deja de responder con texto stub.
2. El router agrega un handler específico para:
   - entrada inicial de recordatorios
   - callbacks `rem:*`
   - retorno a menú
3. `booking_fsm` no se modifica para callbacks `rem:*`.

### Requisito técnico

El flujo debe usar `callback_message_id` ya presente en [f/flows/telegram_webhook__flow/telegram_webhook_trigger.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/flows/telegram_webhook__flow/telegram_webhook_trigger.py:43) para editar el mismo mensaje vía `telegram_send` con `mode="edit_message"`.

### Contrato de callback

Usar prefijos cerrados:

- `rem:ch:telegram`
- `rem:ch:email`
- `rem:w:1day`
- `rem:w:24h`
- `rem:w:12h`
- `rem:w:6h`
- `rem:w:2h`
- `rem:w:1h`
- `rem:w:30min`
- `rem:off`
- `rem:all`
- `rem:back`

Sin parseo ambiguo y sin colisionar con callbacks de booking.

---

## Fase 4 — Política de ventanas y quiet hours

### Problema conceptual del plan original

`1day` y `24h` no son equivalentes. Si ambos existen, pueden producir duplicados o comportamientos difíciles de explicar al usuario.

### Política propuesta

1. `1day`:
   - significa "día anterior a las 08:00 hora local del proveedor"
   - no compite con `24h`
2. `24h`, `12h`, `6h`, `2h`, `1h`, `30min`:
   - son offsets reales respecto de `start_time`
3. Si una ventana cae en quiet hours:
   - no se envía
   - se registra `skipped_quiet_hours`
   - no se vuelve a intentar esa combinación `booking + window + channel`

### Archivo sugerido

Crear `f/reminder_cron/_window_policy.py` con una sola responsabilidad:

- calcular elegibilidad
- decidir `send` vs `skip_quiet_hours`
- exponer el motivo de decisión

No mezclar eso con SQL ni con envío.

---

## Fase 5 — `reminder_cron` con fallos parciales explícitos

### Problema actual

[f/reminder_cron/main.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/reminder_cron/main.py:90) puede sumar error y aun así marcar la ventana como enviada. Eso contradice la regla `WM-08`.

### Estructura propuesta

1. `f/reminder_cron/_reminder_models.py`
   - modelos Pydantic y literales
2. `f/reminder_cron/_reminder_repository.py`
   - lecturas de bookings elegibles
   - persistencia de dispatch status
3. `f/reminder_cron/_window_policy.py`
   - cálculo de quiet hours y decisión
4. `f/reminder_cron/_delivery_service.py`
   - enviar a Telegram/email según preferencias ya validadas
5. `f/reminder_cron/main.py`
   - recorrer lotes y coordinar

### Regla operativa

Para cada `booking + window + channel`:

1. Si el canal está desactivado en preferencias, no crear dispatch.
2. Si cae en quiet hours, registrar `skipped_quiet_hours`.
3. Si se intenta enviar y falla, registrar `failed`.
4. Solo si el canal realmente salió, registrar `sent`.

### Resultado esperado

El output del cron debe exponer contadores explícitos:

- `sent`
- `skipped_quiet_hours`
- `failed`
- `processed_bookings`

No más claves armadas dinámicamente con `cast("Any", result)[counter_key]`.

---

## Fase 6 — Compatibilidad con `telegram_send` y `gmail_send`

### Reglas

1. Reusar el contrato real de `telegram_send`, incluyendo `mode="edit_message"` cuando venga de callback.
2. Reusar el contrato real de `gmail_send` sin inventar una forma "genérica" que lo degrade.
3. Si hace falta una capa común, que sea a nivel de servicio interno, no como DTO débil.

### Punto importante

[f/gmail_send/_gmail_models.py](/home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/gmail_send/_gmail_models.py:21) hoy solo acepta `reminder_24h`, `reminder_2h`, `reminder_30min`.

Eso obliga a una de estas dos decisiones:

1. Agregar nuevos `message_type` de email para `1day`, `12h`, `6h`, `1h`.
2. Reducir el alcance de email y dejar documentado que solo Telegram soporta todas las ventanas en esta iteración.

Recomendación: soportar todas las ventanas también en email solo si existen templates claros. Si no, declarar explícitamente que email queda acotado en v1 de esta mejora.

---

## Fase 7 — Pruebas

El plan original es débil en testing. Eso no pasa con este repo.

### Unit tests obligatorios

1. `tests/py/reminder_config/test_config_service.py`
   - defaults
   - toggle_channel
   - toggle_window
   - activate_all
   - deactivate_all
2. `tests/py/reminder_config/test_config_view.py`
   - render correcto de inline keyboard
   - callback_data correcto por botón
3. `tests/py/reminder_cron/test_window_policy.py`
   - `1day`
   - `24h`
   - `12h`
   - quiet hours
   - no reintento tras `skipped_quiet_hours`
4. `tests/py/reminder_cron/test_delivery_service.py`
   - Telegram success
   - Email success
   - fallo parcial
5. `tests/py/internal/telegram_router/test_router_reminders.py`
   - opción `"3"`
   - callback `rem:*`
   - back a menú
   - edición inline

### Regla de pruebas

No red. No Windmill real. Mock en bordes.

---

## Fase 8 — Gates obligatorios

Ejecutar en este orden:

1. `uv run ruff check .`
2. `uv run ruff format --check .`
3. `uv run mypy --strict .`
4. `uv run pyright .`
5. `uv run pytest -q`

No cierres la tarea con solo `mypy` y `pytest`. El plan original omite `pyright`.

---

## Orden de Implementación Corregido

1. Definir modelos estrictos de `reminder_config` y router inline keyboard.
2. Crear migración `booking_reminder_dispatches`.
3. Separar `reminder_config` en repository/service/view.
4. Implementar handler de router para opción `"3"` y callbacks `rem:*`.
5. Implementar `window_policy` con quiet hours.
6. Rehacer `reminder_cron` para persistir estado por `booking + window + channel`.
7. Ajustar integración con `telegram_send`.
8. Ajustar integración con `gmail_send` o declarar límite explícito.
9. Escribir pruebas unitarias por módulo.
10. Pasar `ruff`, `mypy --strict`, `pyright`, `pytest`.

---

## Decisiones Directas

1. No recomiendo agregar más columnas `reminder_*_sent` a `bookings`.
2. No recomiendo tocar `booking_fsm` para parsear callbacks de recordatorios.
3. No recomiendo introducir un dispatcher genérico "future-proof" si todavía no existe un contrato homogéneo entre canales.
4. Sí recomiendo normalizar el estado de dispatch ahora; si no, la parte "multi-canal" del plan es humo.

---

## Diferencias Frente al Plan Original

1. Reemplacé columnas booleanas nuevas por una tabla de dispatch por `booking + window + channel`.
2. Eliminé la idea de meter `rem:*` dentro de `booking_fsm`; eso va en `telegram_router`.
3. Rechacé el dispatcher genérico débil y lo cambié por servicios tipados por responsabilidad.
4. Hice explícito el uso de `callback_message_id` y `edit_message` para que la UI inline sea real y no decorativa.
5. Cambié "skip silencioso" por estado persistido `skipped_quiet_hours`.
6. Separé `reminder_config` en repository/service/view para cumplir SRP.
7. Añadí `pyright` y pruebas unitarias específicas como gates obligatorios.
8. Cerré la fuga de `Any`/`dict` que el plan original seguía ampliando.
