# Plan C — Integración Completa del AI Agent como Router Conversacional

**Estado previo al Plan C:** Options A+B ya implementadas.
- A: router maneja saludos + todos los intents NLU en idle state.
- B: ai_agent corre como paso en el flow y pasa `ai_intent`/`ai_confidence` al router.

**Objetivo del Plan C:** El router hace SOLO transiciones FSM de booking. El ai_agent maneja TODO lo conversacional. El flow bifurca según el output del ai_agent.

---

## 1. Arquitectura objetivo

```
webhook_trigger
    → deduplicate
    → preprocessor
    → get_conversation_state
    → auto_register
    → ai_agent          ← classifica intent, genera respuesta conversacional
    → booking_prefetch  ← solo si intent es booking-related
    → fsm_router        ← solo si intent requiere FSM
    → conversational_router  ← solo si intent NO requiere FSM
    → client_register
    → update_conversation_state
    → booking_commit
    → send_telegram_response
```

**Regla de bifurcación:**
- `ai_agent.data.requires_fsm_routing == True` → `fsm_router` activo, `conversational_router` skipped
- `ai_agent.data.requires_fsm_routing == False` → `conversational_router` activo, `fsm_router` skipped

---

## 2. Cambios por archivo — orden obligatorio

### 2.1 `f/internal/ai_agent/_ai_agent_models.py`

**Añadir campo `requires_fsm_routing` a `IntentResult`:**

```python
# En class IntentResult(BaseModel), añadir DESPUÉS de validation_passed:
requires_fsm_routing: bool = False
```

**Regla de derivación** (se calcula en el paso 2.3):
- `requires_fsm_routing = True` cuando intent es uno de:
  `"crear_cita"`, `"cancelar_cita"`, `"reagendar_cita"`, `"ver_disponibilidad"`
  **Y** el estado FSM actual NO es `"idle"` (ya está en mid-flow)
  O el intent es booking Y el estado es `"idle"` (inicia el flow)
- `requires_fsm_routing = False` para todos los demás intents

**Invariante crítica:** si `booking_state.name != "idle"` (ej: `selecting_doctor`), SIEMPRE `requires_fsm_routing = True` independientemente del intent — el FSM en curso no puede interrumpirse.

### 2.2 `f/internal/ai_agent/_ai_agent_logic.py`

**Añadir función `compute_requires_fsm_routing`:**

```python
_FSM_INTENTS: frozenset[str] = frozenset({
    "crear_cita", "cancelar_cita", "reagendar_cita", "ver_disponibilidad"
})

_FSM_ACTIVE_STATES: frozenset[str] = frozenset({
    "selecting_specialty", "selecting_doctor", "selecting_time",
    "confirming", "needs_registration", "reg_confirming_name",
    "reg_entering_name", "reg_collecting_phone", "reg_collecting_email",
})


def compute_requires_fsm_routing(intent: str, booking_state_name: str) -> bool:
    """Returns True if this message must go through the FSM router."""
    # FSM in progress → always route through FSM regardless of intent
    if booking_state_name in _FSM_ACTIVE_STATES:
        return True
    # Booking intent from idle → initiate FSM
    if intent in _FSM_INTENTS and booking_state_name == "idle":
        return True
    return False
```

**Añadir llamada en `_main_async`** — DESPUÉS del bloque de `verify_urgency` y ANTES del return:

```python
# Extract booking_state_name from conversation_state if available
booking_state_name = "idle"
if input_data.conversation_state:
    # conversation_state now accepts booking_state_name as extra field
    raw_state = input_data.conversation_state.model_extra or {}
    booking_state_name = str(raw_state.get("booking_state_name", "idle"))

requires_fsm = compute_requires_fsm_routing(verified.intent, booking_state_name)

# Rebuild result with requires_fsm_routing
final_result = IntentResult(
    **{**verified.model_dump(), "requires_fsm_routing": requires_fsm}
)

return {"success": True, "data": final_result.model_dump(), "error_message": None}
```

### 2.3 `f/internal/ai_agent/_ai_agent_models.py` — `ConversationState`

**Cambiar `extra="forbid"` a `extra="allow"`** para que el flow pueda pasar `booking_state_name` sin que Pydantic rechace el input:

```python
class ConversationState(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow")  # era extra="forbid"
    ...
```

### 2.4 `f/internal/telegram_router/main.py` → renombrar a `f/internal/fsm_router/main.py`

**Crear directorio:** `f/internal/fsm_router/`

**Mover estos archivos** (actualizar imports en cada uno):
- `f/internal/telegram_router/main.py` → `f/internal/fsm_router/main.py`
- `f/internal/telegram_router/_router_models.py` → `f/internal/fsm_router/_router_models.py`
- `f/internal/telegram_router/_router_reminders.py` → `f/internal/fsm_router/_router_reminders.py`
- `f/internal/telegram_router/handlers/` → `f/internal/fsm_router/handlers/`

**En el nuevo `fsm_router/main.py`:**
- Eliminar COMPLETAMENTE el bloque `if current_state_name == "idle" and not is_callback:` (lines 427-482 actuales) — todo ese NLU pasa al ai_agent.
- El router solo procesa cuando `current_state_name` es un estado FSM activo O cuando recibe un intent de booking desde idle.
- Añadir guard al inicio de `_route`:

```python
# Si el ai_agent ya determinó que NO requiere FSM, no hacer nada
if not input_data.requires_fsm_routing and current_state_name == "idle":
    return RouterResult(handled=False)
```

**Añadir `requires_fsm_routing: bool = False` a `RouterInput`:**

```python
class RouterInput(BaseModel):
    model_config = ConfigDict(strict=True)
    chat_id: str
    user_input: str
    requires_fsm_routing: bool = False
    # ... resto igual
```

### 2.5 Crear `f/internal/conversational_router/main.py` (NUEVO)

Este script maneja todos los intents no-FSM. Es el reemplazo del bloque idle del router actual.

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic>=2.10.0",
#   "asyncpg>=0.30.0",
#   "redis>=7.4.0",
#   "beartype>=0.19.0",
# ]
# ///
from __future__ import annotations

import asyncio
from typing import Any, Final

from pydantic import BaseModel, ConfigDict

from ..booking_fsm._fsm_machine import get_main_menu_text
from .._nlu_cache import ensure_nlu_cache
from .._wmill_adapter import log
from ...rag_query.main import run_rag_query

MODULE: Final[str] = "conversational_router"


class ConversationalInput(BaseModel):
    model_config = ConfigDict(strict=True)
    chat_id: str
    user_input: str
    ai_intent: str
    ai_confidence: float
    ai_response: str | None = None
    client_id: str | None = None
    client_name: str | None = None
    phone: str | None = None
    pg_url: str | None = None
    current_state_name: str = "idle"


class ConversationalResult(BaseModel):
    model_config = ConfigDict(strict=True)
    handled: bool
    response_text: str | None = None
    nextState: dict[str, object] | None = None
    inline_buttons: list[list[dict[str, str]]] | None = None


_INTENT_TO_HANDLER: dict[str, str] = {
    "saludo": "greeting",
    "despedida": "farewell",
    "agradecimiento": "thanks",
    "mostrar_menu_principal": "menu",
    "pregunta_general": "rag",
    "desconocido": "rag",
    "urgencia": "rag",
    "ver_mis_citas": "mis_citas",
    "activar_recordatorios": "recordatorios",
    "desactivar_recordatorios": "recordatorios",
    "preferencias_recordatorio": "recordatorios",
}


async def _handle(inp: ConversationalInput) -> ConversationalResult:
    await ensure_nlu_cache()
    handler = _INTENT_TO_HANDLER.get(inp.ai_intent, "rag")
    state_raw: dict[str, object] = {"name": inp.current_state_name}

    if handler == "greeting":
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text="¡Hola! 👋\n\n" + get_main_menu_text(),
        )

    if handler == "farewell":
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text="¡Hasta pronto! 👋 Cuando quieras, estoy aquí.",
        )

    if handler == "thanks":
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text="¡Con gusto! 😊\n\n" + get_main_menu_text(),
        )

    if handler == "menu":
        return ConversationalResult(
            handled=True,
            nextState={"name": "idle"},
            response_text=get_main_menu_text(),
        )

    if handler == "mis_citas":
        # Import inline to avoid circular deps
        from ...internal.telegram_router.main import _handle_mis_citas, RouterInput
        # Delegate to existing handler (or duplicate logic here for clean separation)
        # TODO in C: move _handle_mis_citas to a shared _booking_queries module
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text="Redirigiendo a Mis Citas...",  # placeholder — complete in C
        )

    if handler == "recordatorios":
        return ConversationalResult(
            handled=True,
            nextState={"name": "reminders_config"},
            response_text="🔔 *Recordatorios*\n\nUsa el menú de botones para configurar tus recordatorios.",
        )

    # RAG fallback
    if inp.pg_url:
        try:
            rag_result = await run_rag_query(inp.user_input.strip(), inp.pg_url, top_k=2)
            if rag_result["count"] > 0:
                parts = [
                    f"📖 *{entry['title']}*\n\n{entry['content']}"
                    for entry in rag_result["entries"]
                ]
                return ConversationalResult(
                    handled=True,
                    nextState={"name": "información"},
                    response_text="\n\n---\n\n".join(parts) + "\n\n_Escribe *menú* para volver._",
                )
        except Exception as e:
            log("RAG_ERROR", error=str(e), module=MODULE)

    return ConversationalResult(
        handled=True,
        nextState={"name": "información"},
        response_text=(
            "No estoy seguro de cómo ayudarte con eso. 🤔\n\n"
            "Puedes preguntar sobre horarios, pagos o servicios.\n\n" + get_main_menu_text()
        ),
    )


async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    inp = ConversationalInput.model_validate(args)
    result = await _handle(inp)
    return {"data": result.model_dump()}


def main(args: dict[str, Any]) -> dict[str, Any]:
    return asyncio.run(_main_async(args))
```

### 2.6 `f/flows/telegram_webhook__flow/flow.yaml` — Refactor completo del flow

**Paso `ai_agent`** — añadir `booking_state_name` al conversation_state:
```yaml
- id: ai_agent
  summary: Clasificar intención — social + TF-IDF + LLM
  value:
    type: script
    input_transforms:
      chat_id:
        type: javascript
        expr: results.webhook_trigger.chat_id
      text:
        type: javascript
        expr: results.message_preprocessor?.cleaned_text || results.webhook_trigger.canonical_text || ""
      provider_id:
        type: javascript
        expr: "null"
      conversation_state:
        type: javascript
        expr: >-
          { "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": results.get_conversation_state.data?.booking_state?.name || "idle" }
    path: f/internal/ai_agent/main
  skip_if:
    expr: >-
      !results.webhook_trigger.chat_id ||
      results.telegram_deduplicate.duplicate ||
      results.webhook_trigger.event_kind !== "message"
```

**Paso `booking_prefetch`** — añadir skip para intents no-booking:
```yaml
skip_if:
  expr: >-
    !results.webhook_trigger.chat_id ||
    results.telegram_deduplicate.duplicate ||
    !results.ai_agent?.data?.requires_fsm_routing
```

**Paso `fsm_router`** (ex `router`):
```yaml
- id: fsm_router
  summary: FSM booking — solo transiciones de estado
  value:
    type: script
    input_transforms:
      args:
        type: javascript
        expr: >-
          { "chat_id": results.webhook_trigger.chat_id,
            "user_input": results.message_preprocessor?.cleaned_text || results.webhook_trigger.canonical_text,
            "state": results.get_conversation_state.data || {},
            "items": results.booking_prefetch?.items || [],
            "phone": results.telegram_auto_register?.phone ?? null,
            "client_name": results.telegram_auto_register?.name ?? null,
            "prefetch_block_reason": results.booking_prefetch?.block_reason || null,
            "client_id": results.telegram_auto_register?.client_id ?? null,
            "callback_message_id": results.webhook_trigger.callback_message_id ?? null,
            "pg_url": variable("u/admin/DATABASE_URL"),
            "requires_fsm_routing": results.ai_agent?.data?.requires_fsm_routing ?? true }
    path: f/internal/fsm_router/main
  skip_if:
    expr: >-
      !results.webhook_trigger.chat_id ||
      results.telegram_deduplicate.duplicate ||
      !results.ai_agent?.data?.requires_fsm_routing
```

**Paso `conversational_router`** (NUEVO):
```yaml
- id: conversational_router
  summary: Respuesta conversacional — no-FSM
  value:
    type: script
    input_transforms:
      args:
        type: javascript
        expr: >-
          { "chat_id": results.webhook_trigger.chat_id,
            "user_input": results.message_preprocessor?.cleaned_text || results.webhook_trigger.canonical_text,
            "ai_intent": results.ai_agent?.data?.intent || "desconocido",
            "ai_confidence": results.ai_agent?.data?.confidence || 0.0,
            "ai_response": results.ai_agent?.data?.ai_response || null,
            "client_id": results.telegram_auto_register?.client_id ?? null,
            "client_name": results.telegram_auto_register?.name ?? null,
            "phone": results.telegram_auto_register?.phone ?? null,
            "pg_url": variable("u/admin/DATABASE_URL"),
            "current_state_name": results.get_conversation_state.data?.booking_state?.name || "idle" }
    path: f/internal/conversational_router/main
  skip_if:
    expr: >-
      !results.webhook_trigger.chat_id ||
      results.telegram_deduplicate.duplicate ||
      results.ai_agent?.data?.requires_fsm_routing === true
```

**Paso `update_conversation_state`** — unificar output de ambos routers:
```yaml
"booking_state": results.fsm_router?.data?.nextState || results.conversational_router?.data?.nextState,
"active_flow": results.fsm_router?.data?.active_flow || null,
"booking_draft": results.fsm_router?.data?.nextDraft ?? null,
```

**Paso `send_telegram_response`** — seleccionar la respuesta correcta:
```yaml
text:
  type: javascript
  expr: >-
    (results.booking_commit?.success) ? ("✅ *Reserva Confirmada*\n\n" + ...)
    : (results.booking_commit?.error) ? ("❌ No se pudo confirmar la cita.\n\n" + ...)
    : (results.fsm_router?.data?.handled && results.fsm_router?.data?.response_text)
      ? results.fsm_router.data.response_text
    : (results.conversational_router?.data?.handled && results.conversational_router?.data?.response_text)
      ? results.conversational_router.data.response_text
    : "Lo siento, no entendí tu mensaje. 😊\n\nEscribe /start para ver el menú principal."
```

---

## 3. Orden de implementación (ESTRICTO — no saltarse pasos)

```
1. _ai_agent_models.py    → añadir requires_fsm_routing a IntentResult
2. _ai_agent_logic.py     → añadir compute_requires_fsm_routing() + llamada en _main_async
3. _ai_agent_models.py    → ConversationState extra="allow"
4. Tests ai_agent          → verificar requires_fsm_routing en output
5. fsm_router/             → crear directorio, copiar archivos de telegram_router/
6. fsm_router/main.py      → eliminar bloque idle, añadir guard requires_fsm_routing
7. fsm_router/_router_models.py → añadir requires_fsm_routing: bool
8. Tests fsm_router        → verificar que idle sin booking intent retorna handled=False
9. conversational_router/  → crear módulo nuevo completo
10. Tests conversational_router → cubrir todos los intents del _INTENT_TO_HANDLER map
11. flow.yaml              → refactor completo según sección 2.6
12. GATES: mypy --strict, pyright, ruff, pytest -q
13. Deploy: wmill sync push --yes
14. Test E2E: wmill flow run con "hola", "quiero cancelar mi cita", "acepta fonasa?"
```

---

## 4. Tests requeridos antes del deploy

### 4.1 `tests/test_ai_agent.py` (nuevo o extender existente)

```python
# INVARIANTE 1: booking intent desde idle → requires_fsm_routing = True
def test_crear_cita_from_idle_requires_fsm():
    result = main(chat_id="1", text="quiero agendar una cita",
                  conversation_state={"active_flow": "none", "flow_step": 0,
                                      "pending_data": {}, "booking_state_name": "idle"})
    assert result["data"]["requires_fsm_routing"] is True

# INVARIANTE 2: FSM en curso → requires_fsm_routing = True siempre
def test_mid_fsm_always_requires_fsm():
    result = main(chat_id="1", text="hola",
                  conversation_state={"active_flow": "none", "flow_step": 0,
                                      "pending_data": {}, "booking_state_name": "selecting_doctor"})
    assert result["data"]["requires_fsm_routing"] is True

# INVARIANTE 3: saludo desde idle → requires_fsm_routing = False
def test_greeting_from_idle_no_fsm():
    result = main(chat_id="1", text="hola",
                  conversation_state={"active_flow": "none", "flow_step": 0,
                                      "pending_data": {}, "booking_state_name": "idle"})
    assert result["data"]["requires_fsm_routing"] is False
    assert result["data"]["intent"] == "saludo"
```

### 4.2 `tests/test_fsm_router.py`

```python
# INVARIANTE: sin requires_fsm_routing → handled=False
async def test_fsm_router_ignores_non_booking_in_idle():
    args = {"chat_id": "1", "user_input": "hola",
            "state": {"booking_state": {"name": "idle"}},
            "requires_fsm_routing": False}
    res = await main(args)
    assert res["data"]["handled"] is False

# INVARIANTE: selecting_doctor → FSM avanza normalmente
async def test_fsm_router_advances_selecting_doctor():
    args = {"chat_id": "1", "user_input": "1",
            "state": {"booking_state": {"name": "selecting_doctor", ...}},
            "requires_fsm_routing": True, "items": [...]}
    res = await main(args)
    assert res["data"]["handled"] is True
```

### 4.3 `tests/test_conversational_router.py`

```python
# Un test por cada entrada del _INTENT_TO_HANDLER map
@pytest.mark.parametrize("intent,expected_state", [
    ("saludo", "idle"),
    ("despedida", "idle"),
    ("agradecimiento", "idle"),
    ("mostrar_menu_principal", "idle"),
    ("activar_recordatorios", "reminders_config"),
    ("pregunta_general", "información"),
    ("desconocido", "información"),
])
async def test_conversational_handler(intent, expected_state):
    args = {"chat_id": "1", "user_input": "test", "ai_intent": intent,
            "ai_confidence": 0.9, "current_state_name": "idle"}
    res = await main(args)
    assert res["data"]["handled"] is True
    assert res["data"]["nextState"]["name"] == expected_state
```

---

## 5. Contrato de estado (invariantes que NO deben romperse)

| Condición | Resultado esperado |
|-----------|-------------------|
| `booking_state.name in _FSM_ACTIVE_STATES` | `requires_fsm_routing = True` SIEMPRE |
| `intent == "crear_cita" AND state == "idle"` | `requires_fsm_routing = True` |
| `intent == "saludo" AND state == "idle"` | `requires_fsm_routing = False` |
| `intent == "desconocido" AND state == "idle"` | `requires_fsm_routing = False` → RAG |
| `/start` command | bypass ambos routers, responder directo en `fsm_router` |
| callback_query (`:` en user_input) | `requires_fsm_routing = True` (FSM siempre) |

---

## 6. Trampas conocidas — leer antes de implementar

1. **`/start` command:** El `fsm_router` tiene un check especial para `/start` en la línea 357. Este check debe mantenerse en `fsm_router` y NO moverse al `conversational_router`, porque `/start` resetea el estado FSM. Añadir `ai_agent.skip_if` para `/start` también es válido — es un comando, no texto libre.

2. **Callbacks (inline buttons):** El `event_kind` es `"callback_query"`, no `"message"`. El `ai_agent` ya tiene `skip_if: event_kind !== "message"`. Los callbacks siempre deben ir a `fsm_router` con `requires_fsm_routing = True`. Añadir al `conversational_router.skip_if`: `|| results.webhook_trigger.event_kind !== "message"`.

3. **`conversation_state` format mismatch:** El modelo `ConversationState` del ai_agent tiene campos como `previous_intent`, `active_flow` (con valores estrictos como `"booking_wizard"`). El flow pasa un dict con `booking_state_name`. Gracias a `extra="allow"` (paso 2.3), el campo extra pasa sin error, y `compute_requires_fsm_routing` lo lee de `model_extra`. No intentar mapear `active_flow` del flow al `active_flow` del ai_agent — tienen semánticas distintas.

4. **`_handle_mis_citas` compartido:** El `conversational_router` necesita query de bookings, que actualmente está en `telegram_router/main.py`. En la implementación de C, mover `_query_my_bookings` y `_handle_mis_citas` a un módulo compartido `f/internal/_booking_queries.py`. Ambos routers lo importan desde ahí.

5. **`registration_data` en `send_telegram_response`:** El paso `client_register` hace skip si `!results.router?.data?.registration_data`. En C, el path es `results.fsm_router?.data?.registration_data`. Actualizar el skip_if del `client_register` para que use `results.fsm_router`.

6. **`booking_commit` skip condition:** Actualmente depende de `results.get_conversation_state?.data?.booking_state?.name === "confirming"` y `results.router?.data?.nextState?.name === "idle"`. En C: `results.router` → `results.fsm_router`. Actualizar.

7. **`edit_message` para callbacks:** Solo el `fsm_router` puede emitir `edit_message: true` (para editar mensajes con inline buttons). El `conversational_router` nunca edita. El `send_telegram_response` ya lo maneja con `results.router?.data?.edit_message` — cambiar a `results.fsm_router?.data?.edit_message`.

8. **mypy strict en `_main_async` del ai_agent:** Al reconstruir `IntentResult` con spread (`**verified.model_dump()`), mypy puede quejarse del tipo. Usar `IntentResult.model_validate({**verified.model_dump(), "requires_fsm_routing": requires_fsm})` en su lugar — es type-safe.

---

## 7. Verificación E2E post-deploy

Ejecutar en orden con `wmill flow run f/flows/telegram_webhook`:

```bash
# Greeting → conversational_router → "¡Hola! 👋"
wmill flow run f/flows/telegram_webhook -d '{"update_id": 9001, "message": {"message_id": 9001, "from": {"id": 5391760292, "is_bot": false, "first_name": "Test", "language_code": "es"}, "chat": {"id": 5391760292, "type": "private"}, "date": 1234567890, "text": "hola"}}'

# Booking intent → fsm_router → selecting_specialty
wmill flow run f/flows/telegram_webhook -d '{"update_id": 9002, "message": {"message_id": 9002, "from": {"id": 5391760292, "is_bot": false, "first_name": "Test", "language_code": "es"}, "chat": {"id": 5391760292, "type": "private"}, "date": 1234567891, "text": "quiero agendar una cita"}}'

# RAG question → conversational_router → RAG response
wmill flow run f/flows/telegram_webhook -d '{"update_id": 9003, "message": {"message_id": 9003, "from": {"id": 5391760292, "is_bot": false, "first_name": "Test", "language_code": "es"}, "chat": {"id": 5391760292, "type": "private"}, "date": 1234567892, "text": "acepta fonasa"}}'
```

**Para cada resultado, verificar en `listJobs`:**
- `fsm_router` step: skipped para greeting/RAG, executed para booking
- `conversational_router` step: skipped para booking, executed para greeting/RAG
- `send_telegram_response`: siempre ejecutado, texto correcto

---

## 8. Rollback

Si algo falla tras el deploy:
1. Revertir `flow.yaml` al estado de Option B (conservar en git).
2. El `fsm_router` y `conversational_router` pueden quedar en el repo — no afectan nada si el flow no los llama.
3. El campo `requires_fsm_routing` en `IntentResult` es aditivo — no rompe nada existente.
