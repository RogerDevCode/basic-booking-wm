# PLAN — Opción B: InlineKeyboardMarkup + editMessageText

**Objetivo:** Resolver el LOOP del wizard reemplazando texto numérico por botones inline con callback_data, editando el mensaje original en vez de enviar nuevos.

**Commit base:** `5bae7f4` (main)

---

## Diagnóstico del bug actual

```
Usuario: "1" → Router: menu match → "📅 Agendar Cita..."
Usuario: "1" → Router: menu match → "📅 Agendar Cita..."  ← LOOP
```

Causa: El router no tiene contexto de paso. "1" siempre es `book_appointment`.

## Solución: InlineKeyboardMarkup

```
Usuario: /start → Router: callback match → sendMessage("Especialidades", inline_keyboard)
Usuario: click "Cardiología" → callback_data "spec:1" → editMessageText("Doctores", inline_keyboard)
Usuario: click "Dr. Pérez" → callback_data "doc:1" → editMessageText("Horarios", inline_keyboard)
Usuario: click "9:00 AM" → callback_data "time:1" → editMessageText("¿Confirmar?", inline_keyboard)
Usuario: click "Sí" → callback_data "cfm:yes" → editMessageText("✅ Confirmada", inline_keyboard)
```

Cada click:
1. answerCallbackQuery (quita el "cargando")
2. editMessageText (reemplaza el mensaje original)
3. NO genera spam en el chat

---

## FASE B.1 — telegram_send: editMessageText + answerCallbackQuery

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `f/telegram_send/main.ts` | AGREGAR: modo `edit_message` → POST a `/editMessageText` |
| `f/telegram_send/main.ts` | AGREGAR: modo `answer_callback` → POST a `/answerCallbackQuery` |
| `f/telegram_send/main.ts` | AGREGAR: campo `message_id` al input para editMessageText |
| `f/telegram_send/main.ts` | AGREGAR: campo `callback_query_id` al input para answerCallbackQuery |

### Input schema nuevo

```typescript
mode: z.enum([
  'send_message',       // POST /sendMessage
  'edit_message',       // POST /editMessageText
  'answer_callback',    // POST /answerCallbackQuery
  'delete_message',     // POST /deleteMessage
])
message_id: z.number().int().optional()     // para edit/delete
callback_query_id: z.string().optional()    // para answer_callback
callback_alert: z.string().optional()       // popup text para answer_callback
```

### Endpoints de Telegram API

| Acción | Endpoint | Campos |
|---|---|---|
| Enviar | `POST /sendMessage` | chat_id, text, reply_markup |
| Editar | `POST /editMessageText` | chat_id, message_id, text, reply_markup |
| Responder | `POST /answerCallbackQuery` | callback_query_id, text, show_alert |
| Borrar | `POST /deleteMessage` | chat_id, message_id |

---

## FASE B.2 — booking_fsm: callback_data builders

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `f/internal/booking_fsm/types.ts` | AGREGAR: `CallbackData` type (max 64 bytes) |
| `f/internal/booking_fsm/responses.ts` | AGREGAR: `buildInlineKeyboard()` helpers |

### callback_data format (≤64 bytes)

```
spec:{idx}          → specialty selection (e.g. "spec:1")
doc:{idx}           → doctor selection (e.g. "doc:2")
time:{idx}          → time slot selection (e.g. "time:3")
cfm:yes             → confirm booking
cfm:no              → decline booking
back                → go back one step
cancel              → cancel flow → idle
menu                → back to main menu
```

Cada callback_data es ≤12 bytes (muy por debajo del límite de 64).

### Response format del wizard

Cada estado del wizard ahora retorna:
```typescript
interface WizardOutput {
  readonly text: string;              // "Selecciona especialidad"
  readonly inline_keyboard: InlineButton[][];  // botones
  readonly nextFlowStep: number;
  readonly advance: boolean;
  readonly should_edit: boolean;      // true = editMessageText, false = sendMessage
}
```

---

## FASE B.3 — router: callback query handler

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `f/internal/telegram_router/main.ts` | AGREGAR: parse callback_data wizard patterns |
| `f/internal/telegram_router/main.ts` | AGREGAR: route `callback` → wizard FSM dispatch |

### Router prioridad actualizada

```
1. callback_data wizard pattern (spec:*, doc:*, time:*, cfm:*) → FSM dispatch
2. callback_data system pattern (cnf:, cxl:, res:, act:, dea:) → legacy callbacks
3. slash commands → direct response
4. menu text → direct response
5. Fallback → AI Agent
```

---

## FASE B.4 — flow.yaml: wizard callback flow

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `f/flows/telegram_webhook__flow/flow.yaml` | AGREGAR: gate para callback_query → wizard_dispatch |
| `f/flows/telegram_webhook__flow/flow.yaml` | AGREGAR: módulo editMessageText para actualizar mensajes |
| `f/flows/telegram_webhook__flow/flow.yaml` | AGREGAR: módulo answerCallbackQuery para ACK |

### Flujo del callback

```
Webhook (callback_query)
  → get_conversation_state (obtener estado actual + message_id)
  → telegram_router (parse callback_data → wizard dispatch)
  → telegram_send mode=answer_callback (quita "cargando")
  → telegram_send mode=edit_message (actualiza mensaje original)
  → update_conversation_state (persistir nuevo estado)
```

---

## FASE B.5 — Redis: persistir message_id

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `f/internal/conversation-state/index.ts` | AGREGAR: campo `message_id` al estado |
| `f/internal/conversation_update/main.ts` | AGREGAR: aceptar `message_id` en input |

El `message_id` del mensaje con el inline keyboard se guarda en Redis para que editMessageText sepa qué mensaje editar.

---

## FASE B.6 — Tests + validación

### Tests nuevos

| Archivo | Tests |
|---|---|
| `f/telegram_send/main.test.ts` | editMessageText, answerCallbackQuery |
| `f/internal/booking_fsm/callback.test.ts` | callback_data format validation |
| `f/internal/telegram_router/callback-wizard.test.ts` | callback routing |

### Validación manual

```
/start → /reservar → inline keyboard aparece
  → click especialidad → mensaje se edita (no spam)
  → click doctor → mensaje se edita
  → click horario → mensaje se edita
  → click confirmar → mensaje se edita con "✅ Confirmada"
  → answerCallbackQuery funciona (no parpadea)
```

---

## Tracklist de Implementación

```
FASE B.1: telegram_send — editMessageText + answerCallbackQuery  [⬜]
  ├── B.1.1: Agregar modo edit_message al InputSchema            [⬜]
  ├── B.1.2: Agregar modo answer_callback al InputSchema         [⬜]
  ├── B.1.3: Implementar sendEditMessage()                       [⬜]
  ├── B.1.4: Implementar answerCallbackQuery()                   [⬜]
  └── B.1.5: Implementar deleteMessage()                         [⬜]

FASE B.2: booking_fsm — callback_data builders                   [⬜]
  ├── B.2.1: Agregar CallbackData type y validation             [⬜]
  ├── B.2.2: buildSpecialtyKeyboard()                            [⬜]
  ├── B.2.3: buildDoctorKeyboard()                               [⬜]
  ├── B.2.4: buildTimeSlotKeyboard()                             [⬜]
  └── B.2.5: buildConfirmationKeyboard()                         [⬜]

FASE B.3: router — callback query handler                        [⬜]
  ├── B.3.1: Parse callback wizard patterns (spec:*, doc:*, etc) [⬜]
  └── B.3.2: Route to wizard FSM with action mapping             [⬜]

FASE B.4: flow.yaml — wizard callback flow                       [⬜]
  ├── B.4.1: Gate callback_query → wizard_dispatch               [⬜]
  ├── B.4.2: Módulo editMessageText                              [⬜]
  ├── B.4.3: Módulo answerCallbackQuery                          [⬜]
  └── B.4.4: Actualizar input_transforms                         [⬜]

FASE B.5: Redis — persistir message_id                           [⬜]
  ├── B.5.1: Agregar message_id al ConversationStateSchema       [⬜]
  └── B.5.2: Actualizar conversation_update                      [⬜]

FASE B.6: Tests + validación                                     [⬜]
  ├── B.6.1: telegram_send tests (edit/callback)                 [⬜]
  ├── B.6.2: booking_fsm callback tests                          [⬜]
  ├── B.6.3: router callback-wizard tests                        [⬜]
  └── B.6.4: TSC + full test suite + manual test                 [⬜]
```

**Total:** 19 tareas | ~4-6 archivos nuevos | ~5 modificados
