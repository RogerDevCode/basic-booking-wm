# Mejora Módulo Recordatorios — Plan de Implementación

**Fecha:** 2026-05-06  
**Estado:** Pendiente  
**Branch:** main

---

## Problema actual

| Área | Estado |
|------|--------|
| Telegram bot opción "3. Recordatorios" | Stub vacío — no funciona |
| `reminder_config/` | Existe pero nunca conectado al router |
| Ventanas de aviso | Solo 3: 24h, 2h, 30min |
| Canal Telegram | Hardcodeado: `run_script("f/telegram_send/main.py", ...)` |
| Horario nocturno | No manejado — puede enviar a las 3am |

---

## Objetivo

1. Conectar opción "3" del bot a un menú de configuración real (inline keyboard checklist)
2. Expandir a 7 ventanas de aviso con manejo de horario silencioso
3. Abstraer el canal de notificación para soportar WhatsApp/SMS en el futuro sin cambiar lógica

---

## UI Propuesta (Telegram)

Cuando usuario escribe "3" desde menú principal:

```
🔔 *Recordatorios*

[📱 Telegram ✅]  [📧 Email ❌]

[☑️ 1 día antes]  [☑️ 24 horas]
[☐ 12 horas]      [☑️ 6 horas]
[☑️ 2 horas]      [☐ 1 hora]
[☑️ 30 minutos]

[🔕 Desactivar todo]  [« Menú]
```

- Botones son **inline keyboard** — tap toggle, mensaje se edita in-place
- "1 día antes" = día anterior a las **08:00 hora local** del proveedor (no -24h flotante)
- Quiet hours: ventanas que caigan entre **22:00–08:00** local → omitir silenciosamente (sin error, sin marcar sent)

---

## Parte 1 — Notification Dispatcher (abstracción de canal)

### Archivos NUEVOS

**`f/internal/notification_dispatcher/_dispatcher_models.py`**
```python
ReminderChannel = Literal["telegram", "email"]  # añadir "whatsapp", "sms" aquí

class DispatchRequest(BaseModel):
    model_config = ConfigDict(strict=True)
    channel: ReminderChannel
    recipient_id: str          # chat_id (telegram) o email address (email)
    text: str
    buttons: list[dict[str, str]] = []
    booking_details: dict[str, object] | None = None
```

**`f/internal/notification_dispatcher/_dispatcher.py`**
```python
from ..notification_dispatcher._dispatcher_models import DispatchRequest, ReminderChannel

_CHANNEL_SCRIPT: Final[dict[str, str]] = {
    "telegram": "f/telegram_send/main",
    "email":    "f/gmail_send/main",
    # "whatsapp": "f/whatsapp_send/main",  ← solo agregar aquí
}

def dispatch(req: DispatchRequest, run_fn: RunScriptFn) -> tuple[Exception | None, object]:
    """Rutea notificación al script correcto según canal."""
    script = _CHANNEL_SCRIPT[req.channel]
    args = _build_args(req)
    return run_fn(script, args)
```

### Modificar `f/reminder_cron/main.py`

Reemplazar bloque duplicado (telegram + gmail) por:
```python
for channel, recipient in [("telegram", b["client_telegram_chat_id"]),
                            ("email",    b["client_email"])]:
    if recipient and prefs_allow(channel, win_name):
        req = DispatchRequest(channel=channel, recipient_id=recipient, text=msg, buttons=buttons)
        err, _ = dispatch(req, run_script)
        if err:
            result["errors"] += 1
```

---

## Parte 2 — DB Migration

**Archivo NUEVO: `scripts/migration_reminder_windows.sql`**
```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_1day_sent  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_12h_sent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_6h_sent    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent    boolean NOT NULL DEFAULT false;
```

Ejecutar en producción vía Windmill `f/internal/debug_db` o psql directo.

---

## Parte 3 — Modelos Expandidos

### `f/reminder_cron/_reminder_models.py` y `f/reminder_config/_config_models.py`

Reemplazar `ReminderPrefs` flat por estructura nested:

```python
class ChannelPrefs(TypedDict):
    telegram: bool
    email: bool

class WindowPrefs(TypedDict):
    w_1day:  bool   # día anterior a las 08:00
    w_24h:   bool
    w_12h:   bool
    w_6h:    bool
    w_2h:    bool
    w_1h:    bool
    w_30min: bool

class ReminderPrefs(TypedDict):
    channels: ChannelPrefs
    windows:  WindowPrefs

ReminderWindow = Literal["1day", "24h", "12h", "6h", "2h", "1h", "30min"]
```

**Defaults:**
```python
DEFAULT_PREFS: ReminderPrefs = {
    "channels": {"telegram": True, "email": True},
    "windows": {"w_1day": True, "w_24h": True, "w_12h": False,
                "w_6h": False, "w_2h": True, "w_1h": False, "w_30min": True},
}
```

`BookingRecord` añade 4 campos:
```python
reminder_1day_sent: bool
reminder_12h_sent:  bool
reminder_6h_sent:   bool
reminder_1h_sent:   bool
```

---

## Parte 4 — Lógica de Ventanas + Quiet Hours

### `f/reminder_cron/main.py`

**Tabla de ventanas y rangos de detección:**

| Window | Cron match range | Lógica especial |
|--------|-----------------|-----------------|
| `1day` | ±15 min de 08:00 día anterior | Calcular desde fecha cita, no desde `now` |
| `24h`  | [now+23h, now+25h] | Quiet hours check |
| `12h`  | [now+11.5h, now+12.5h] | Quiet hours check |
| `6h`   | [now+5.5h, now+6.5h] | Quiet hours check |
| `2h`   | [now+1h50m, now+2h10m] | — |
| `1h`   | [now+50m, now+70m] | — |
| `30min`| [now+25m, now+35m] | — |

**Quiet hours helper:**
```python
def _is_quiet_hours(send_time_utc: datetime, tz_name: str) -> bool:
    local = send_time_utc.astimezone(ZoneInfo(tz_name))
    return local.hour < 8 or local.hour >= 22
```

**`1day` special query** — no usa ventana temporal estándar, necesita query separada:
```sql
SELECT ... FROM bookings b
JOIN providers p ON ...
LEFT JOIN timezones t ON ...
WHERE b.status = 'confirmed'
  AND b.reminder_1day_sent = false
  AND DATE(b.start_time AT TIME ZONE t.name) = CURRENT_DATE AT TIME ZONE t.name + INTERVAL '1 day'
  AND EXTRACT(HOUR FROM NOW() AT TIME ZONE t.name) = 8
  AND EXTRACT(MINUTE FROM NOW() AT TIME ZONE t.name) BETWEEN 0 AND 14
```
(El cron corre cada 15 min — esta ventana es exacta.)

---

## Parte 5 — Config Logic Expandida

### `f/reminder_config/_config_logic.py`

`build_config_message(p: ReminderPrefs)` → devuelve `(text, inline_buttons)`:

```python
def build_config_message(p: ReminderPrefs) -> tuple[str, list[list[dict[str, str]]]]:
    tg = "✅" if p["channels"]["telegram"] else "❌"
    em = "✅" if p["channels"]["email"]    else "❌"

    def wbtn(key: str, label: str) -> dict[str, str]:
        icon = "☑️" if p["windows"][key] else "☐"
        return {"text": f"{icon} {label}", "callback_data": f"rem:w:{key}"}

    buttons = [
        [{"text": f"📱 Telegram {tg}", "callback_data": "rem:ch:telegram"},
         {"text": f"📧 Email {em}",    "callback_data": "rem:ch:email"}],
        [wbtn("w_1day", "1 día antes"), wbtn("w_24h", "24 horas")],
        [wbtn("w_12h",  "12 horas"),    wbtn("w_6h",  "6 horas")],
        [wbtn("w_2h",   "2 horas"),     wbtn("w_1h",  "1 hora")],
        [wbtn("w_30min","30 minutos")],
        [{"text": "🔕 Desactivar todo", "callback_data": "rem:off"},
         {"text": "« Menú",            "callback_data": "back"}],
    ]
    msg = "🔔 *Recordatorios*\n\nToca para activar/desactivar:"
    return msg, buttons
```

### `f/reminder_config/main.py`

Añadir acción `"toggle_window"` que recibe `window: ReminderWindow` y togglea `prefs["windows"][f"w_{window}"]`.
Añadir acción `"toggle_channel"` que recibe `channel: ReminderChannel` y togglea `prefs["channels"][channel]`.
Siempre retornar `build_config_message(prefs)` actualizado para que el router edite el mensaje.

---

## Parte 6 — Router Telegram (opción "3")

### `f/internal/telegram_router/main.py`

**Nuevas constantes:**
```python
_REMINDERS_STATES: Final[frozenset[str]] = frozenset({"reminders_config"})
```

**Handler principal** (llamado cuando `lower in _RECORDATORIOS_KEYWORDS`):
```python
async def _handle_recordatorios(input_data: RouterInput, current_state_raw: dict[str, object]) -> Result[RouterResult, str]:
    if not input_data.client_id or not input_data.pg_url:
        return Success(RouterResult(handled=True, nextState=current_state_raw,
                                    response_text="⚠️ Necesitas estar registrado para configurar recordatorios.\n\n" + get_main_menu_text()))
    prefs = await _load_reminder_prefs(input_data.client_id, input_data.pg_url)
    msg, buttons = build_config_message(prefs)
    return Success(RouterResult(
        handled=True,
        nextState={"name": "reminders_config", "client_id": input_data.client_id},
        response_text=msg,
        inline_buttons=buttons,
    ))
```

**Handler de estado `reminders_config`** (callbacks `rem:*`):
```python
async def _handle_reminders_state(input_data, current_state_raw, draft_raw):
    cb = input_data.user_input  # e.g. "rem:w:w_12h" o "rem:ch:telegram"
    client_id = str(current_state_raw.get("client_id") or input_data.client_id or "")
    
    if cb == "rem:off":   action, channel, window = "deactivate_all", None, None
    elif cb.startswith("rem:ch:"): action, channel, window = "toggle_channel", cb[7:], None
    elif cb.startswith("rem:w:"):  action, channel, window = "toggle_window", None, cb[6:]
    elif cb == "back":    # retornar a idle
        return Success(RouterResult(handled=True, nextState={"name": "idle"}, response_text=get_main_menu_text()))
    
    # Llamar reminder_config (función directa, no run_script para evitar latencia)
    result = await _call_reminder_config(action, client_id, input_data.pg_url, channel, window)
    msg, buttons = result["message"], result.get("inline_buttons")
    return Success(RouterResult(handled=True,
                                nextState={"name": "reminders_config", "client_id": client_id},
                                response_text=msg, inline_buttons=buttons))
```

### `f/internal/booking_fsm/_fsm_machine.py`

Extender `parse_callback_data()` para prefijo `rem:`:
```python
if data.startswith("rem:") or data == "back":
    return SelectAction(value=data)
```

---

## Parte 7 — booking_create INSERT

### `f/booking_create/_booking_create_repository.py`

Añadir las 4 nuevas columnas al INSERT con valor `false`:
```python
# columnas:
reminder_24h_sent, reminder_2h_sent, reminder_30min_sent,
reminder_1day_sent, reminder_12h_sent, reminder_6h_sent, reminder_1h_sent
# valores:
false, false, false,
false, false, false, false
```

---

## Orden de implementación

```
1. scripts/migration_reminder_windows.sql       → crear + ejecutar en prod
2. f/internal/notification_dispatcher/           → NEW: _dispatcher_models.py, _dispatcher.py
3. f/reminder_cron/_reminder_models.py           → expandir modelos
4. f/reminder_config/_config_models.py           → misma expansión
5. f/reminder_cron/_reminder_repository.py       → nuevas columnas en SELECT/UPDATE
6. f/reminder_config/_config_logic.py            → build_config_message con 7 ventanas
7. f/reminder_config/main.py                     → nuevas acciones toggle
8. f/reminder_cron/main.py                       → dispatcher + 7 ventanas + quiet hours
9. f/booking_create/_booking_create_repository.py → INSERT columnas
10. f/internal/booking_fsm/_fsm_machine.py       → parse_callback_data rem:
11. f/internal/telegram_router/main.py           → opción "3" + reminders_config state
12. mypy --strict → 0 errores
13. pytest -q → sin regresiones
14. sync-fast.sh todos los archivos modificados
```

---

## Verificación E2E

1. Ejecutar migration SQL en prod
2. Bot: escribir "3" → debe aparecer menú checklist con inline buttons
3. Tocar "☐ 12 horas" → debe cambiar a "☑️ 12 horas" y mensaje editarse in-place
4. Tocar "📱 Telegram ✅" → debe cambiar a "❌"
5. Tocar "🔕 Desactivar todo" → todos los botones en "☐"
6. Crear cita mañana 10:00 → `reminder_cron dry_run=true` → confirmar `1day` aparece en processed_bookings
7. Cita a las 07:00 → simular `12h` window → quiet hours → NOT en processed_bookings

---

## Archivos afectados (resumen)

| Archivo | Tipo |
|---------|------|
| `scripts/migration_reminder_windows.sql` | NUEVO |
| `f/internal/notification_dispatcher/_dispatcher_models.py` | NUEVO |
| `f/internal/notification_dispatcher/_dispatcher.py` | NUEVO |
| `f/reminder_cron/_reminder_models.py` | MODIFICAR |
| `f/reminder_cron/_reminder_repository.py` | MODIFICAR |
| `f/reminder_cron/main.py` | MODIFICAR |
| `f/reminder_config/_config_models.py` | MODIFICAR |
| `f/reminder_config/_config_logic.py` | MODIFICAR |
| `f/reminder_config/main.py` | MODIFICAR |
| `f/booking_create/_booking_create_repository.py` | MODIFICAR |
| `f/internal/booking_fsm/_fsm_machine.py` | MODIFICAR |
| `f/internal/telegram_router/main.py` | MODIFICAR |
