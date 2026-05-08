# Plan Definitivo de Refactorización: Módulo de Recordatorios (v3.0)

**Fecha:** 2026-05-07  
**Estado:** Aprobado para Ejecución  
**Contexto:** Basado en revisión exhaustiva Red Team (Técnica RALPH) y alineación con `AGENTS.md`.

---

## 1. Visión Arquitectónica y Criterios Cero Deuda

La arquitectura abandona la "evaluación de políticas en tiempo de ejecución (cron)" y adopta un modelo de **Event-Driven Pre-Scheduling**. 
No agregaremos booleanos a la tabla `bookings`. Crearemos una tabla transaccional de cola de mensajes (`booking_reminder_dispatches`) basada en el patrón Outbox/Job Queue.

### Principios Fundamentales
1. **Cálculo en Inserción (Shift-Left):** Los tiempos exactos de envío se calculan en el momento en que se *crea* o *reagenda* la cita. El Cron se vuelve un ejecutor "tonto" e infalible.
2. **Bloqueo a Nivel de Fila (Concurrency):** El Cron utilizará `FOR UPDATE SKIP LOCKED` en PostgreSQL para permitir múltiples workers sin riesgo de doble envío.
3. **Aislamiento del Router:** La configuración de recordatorios tendrá su propio handler en Telegram, 100% desconectado de `booking_fsm`.

---

## 2. Regla de Negocio: Quiet Hours y el Pívot de las 06:00 AM

El horario de descanso (Quiet Hours) es de **22:00 a 08:00** (Hora local de la clínica).

**Política Definitiva de Reprogramación:**
Si la ventana de notificación calculada (`T_target`) cae dentro de Quiet Hours:
- **NO** se descarta silenciosamente (No más `skipped_quiet_hours`).
- **SE POSPONE** para las **06:00 AM** del día de la cita (Hora local).
- *Caso de borde:* Si la cita es a las 06:00 AM o antes, la notificación se enviará 30 minutos antes de la cita, para no notificar después o en el mismo minuto.
- **Deduplicación:** Si varias ventanas pospuestas colisionan a las 06:00 AM para el mismo canal, el sistema de agendamiento fusionará los envíos en uno solo.

---

## 3. Esquema de Base de Datos (Job Queue)

Archivo a crear: `scripts/migration_019_reminder_dispatches.sql`

```sql
CREATE TABLE booking_reminder_dispatches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    channel text NOT NULL, -- 'telegram', 'email'
    reminder_window text NOT NULL, -- '1day', '24h', '12h', '6h', '2h', '1h', '30min'
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    sent_at timestamptz NULL,
    error_log text NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    -- Garantiza que no se encole dos veces la misma ventana para el mismo canal
    UNIQUE(booking_id, channel, reminder_window)
);

-- Índice optimizado para el Cron Job
CREATE INDEX idx_reminder_queue ON booking_reminder_dispatches(scheduled_for, status) WHERE status = 'pending';
```

---

## 4. Fases Estrictas de Implementación

### Fase 1: Creación de Modelos y Migración DB
1. Ejecutar migración `019_reminder_dispatches.sql`.
2. Refactorizar `f/reminder_config/_config_models.py`:
   - Reemplazar diccionarios crudos por `BaseModel` con `ConfigDict(strict=True)`.
   - Definir literales estrictos: `ReminderChannel`, `ReminderWindow`.

### Fase 2: Motor de Agendamiento (El Cerebro)
1. Crear `f/internal/reminder_scheduler/_scheduler_logic.py`.
2. Implementar función pura: `calculate_dispatch_times(appointment_time, timezone, preferences) -> list[DispatchJob]`.
   - *Aquí vive la lógica de las 06:00 AM y deduplicación.*
3. Crear `f/internal/reminder_scheduler/_scheduler_repository.py`.
   - `sync_booking_reminders(booking_id, new_dispatches)`: Hace un "Upsert" o "Delete and Insert" para alinear la tabla `booking_reminder_dispatches` con la realidad.

### Fase 3: Integración en el Ciclo de Vida de la Cita
Modificar los entrypoints existentes para que actualicen la cola de notificaciones:
1. `f/booking_create/main.py`: Al crear la cita, llamar al `ReminderScheduler`.
2. `f/booking_cancel/main.py`: Al cancelar, hacer `DELETE FROM booking_reminder_dispatches WHERE booking_id = X AND status = 'pending'`.
3. `f/booking_reschedule/main.py`: Al reagendar, recalcular y sincronizar.

### Fase 4: Refactorización del Cron (Infalible)
Reescribir `f/reminder_cron/main.py` y repositorios asociados:
1. Query principal: `SELECT * FROM booking_reminder_dispatches WHERE status = 'pending' AND scheduled_for <= NOW() FOR UPDATE SKIP LOCKED LIMIT 50`.
2. Iterar sobre los resultados.
3. Construir mensaje.
4. Despachar a `telegram_send` o `gmail_send` usando un patrón Factory/Adapter tipado, sin diccionarios sueltos.
5. Marcar como `sent` o `failed` (guardando el error en `error_log`).

### Fase 5: El Router de Telegram (UI Independiente)
1. Crear `f/internal/telegram_router/_router_reminders.py`.
   - Manejar estado `reminders_config`.
   - Parsear prefijos cerrados: `rem:ch:telegram`, `rem:w:12h`, `rem:off`.
2. Modificar `f/internal/telegram_router/main.py`:
   - Integrar la opción `"3"` del menú principal para derivar a `_router_reminders.py`.
3. Utilizar `callback_message_id` para invocar a `telegram_send` con `mode="edit_message"`, logrando una experiencia "In-place" sin spam.

### Fase 6: Gates de Calidad (No Negociable)
Antes del despliegue, ejecutar y asegurar 0 errores:
1. `uv run ruff check --fix .`
2. `uv run mypy --strict .`
3. `uv run pyright .`
4. Escribir Unit Tests para `calculate_dispatch_times` garantizando que los casos de "Quiet Hours" y transiciones de timezone funcionan al 100%. `uv run pytest -q`.

---

## 5. Resolución de Ambigüedades y Notas de Negocio

- **Paridad de Email vs Telegram:** Si `gmail_send` no soporta una plantilla específica (ej. `message_type="reminder_1day"`), el Cron debe capturar el error `NotImplementedError` del adapter de email, registrarlo como `failed` en `error_log` y continuar. Esto visibiliza la deuda de plantillas de email sin frenar el sistema.
- **Reflejo Retroactivo:** Si un usuario cambia sus preferencias en el menú (ej. activa Telegram), ¿qué pasa con las citas ya agendadas? 
  - *Decisión Técnica:* Al guardar nuevas preferencias en `reminder_config/main.py`, se debe lanzar un Background Task en Windmill que recalcule la tabla `booking_reminder_dispatches` para todas las citas futuras en estado `confirmed` de ese cliente.
- **UI/UX Frontend:** Las reglas de visualización de los botones inline están documentadas en `@docs/ui_reminders_notes.md`.