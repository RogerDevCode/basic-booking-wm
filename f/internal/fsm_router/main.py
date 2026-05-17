# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

from typing import TYPE_CHECKING, Final, cast

from beartype import beartype

if TYPE_CHECKING:
    from ...reminder_config._config_models import InlineButton

from ...nlu._tfidf_classifier import classify_intent
from .._booking_shared import get_mis_citas_text
from .._nlu_cache import ensure_nlu_cache
from .._wmill_adapter import log
from ..booking_fsm._fsm_machine import apply_transition, get_main_menu_text, parse_action, parse_callback_data
from ..booking_fsm._fsm_models import BookingStateRoot, DraftBooking
from ._router_models import RouterInput, RouterResult
from ._router_reminders import handle_reminders_config
from .handlers._registration_handler import REG_STATES

MODULE: Final[str] = "fsm_router"


def _get_start_text() -> str:
    return (
        "¡Hola! Soy tu asistente de reservas. 👋\n\n"
        "Puedo ayudarte a agendar, consultar o cancelar una hora médica.\n\n" + get_main_menu_text()
    )


_SI_WORDS: Final[frozenset[str]] = frozenset({"s", "y", "si", "sí", "yes", "ok", "dale", "claro", "correcto", "exacto"})
_NO_WORDS: Final[frozenset[str]] = frozenset({"no", "nope", "nel", "negativo"})
_SKIP_WORDS: Final[frozenset[str]] = frozenset({"saltar", "skip", "omitir"})


def _start_registration(
    input_data: RouterInput,
    source: str,
    draft_raw: dict[str, object],
) -> RouterResult:
    new_draft: dict[str, object] = {**draft_raw, "reg_source": source}
    return RouterResult(
        handled=True,
        nextState={"name": "needs_registration"},
        nextDraft=new_draft,
        active_flow="booking",
        response_text=(
            "Para agendar una hora necesito registrarte primero.\n\n"
            "Solo necesito tu número de teléfono. Es rápido. 😊\n\n"
            "¿Empezamos? Responde *sí* para continuar o *no* para volver al menú."
        ),
    )


async def _handle_mis_citas(
    input_data: RouterInput,
    current_state_raw: dict[str, object],
) -> RouterResult:
    if not input_data.client_id or not input_data.pg_url:
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=("📋 *Mis Horas*\n\nNo pudimos cargar tus horas en este momento.\n\n" + get_main_menu_text()),
        )

    text = await get_mis_citas_text(input_data.client_id, input_data.pg_url, input_data.chat_id)

    if not text:
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=(
                "📋 *Mis Horas*\n\n"
                "No tienes horas próximas agendadas.\n\n"
                "Puedes agendar una nueva hora seleccionando la opción 1.\n\n" + get_main_menu_text()
            ),
        )

    return RouterResult(
        handled=True,
        nextState=current_state_raw,
        response_text=text + "\n\n" + get_main_menu_text(),
    )


def _handle_registration_state(
    input_data: RouterInput,
    current_state_name: str,
    current_state_raw: dict[str, object],
    draft_raw: dict[str, object],
) -> RouterResult:
    lower = input_data.user_input.strip().lower()
    user_text = input_data.user_input.strip()
    client_name = input_data.client_name or "amigo"

    if current_state_name == "needs_registration":
        if lower in _SI_WORDS:
            return RouterResult(
                handled=True,
                nextState={"name": "reg_confirming_name"},
                nextDraft=dict(draft_raw),
                response_text=(
                    f"¡Perfecto! 😊\n\nTu nombre registrado es *{client_name}*.\n¿Es correcto? Responde *sí* o *no*."
                ),
            )
        if lower in _NO_WORDS:
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                nextDraft={},
                response_text=(
                    "Entendido. 👍\n\nPuedes registrarte cuando quieras para agendar horas.\n\n" + get_main_menu_text()
                ),
            )
        attempts = int(str(current_state_raw.get("invalid_attempts", 0))) + 1
        if attempts >= 3:
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                nextDraft={},
                response_text="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                + get_main_menu_text(),
            )
        return RouterResult(
            handled=True,
            nextState={"name": "needs_registration", "invalid_attempts": attempts},
            nextDraft=dict(draft_raw),
            response_text="¿Empezamos con el registro? Responde *sí* o *no*. 😊",
        )

    if current_state_name == "reg_confirming_name":
        if lower in _SI_WORDS:
            new_draft: dict[str, object] = {**dict(draft_raw), "reg_name": client_name}
            return RouterResult(
                handled=True,
                nextState={"name": "reg_collecting_phone"},
                nextDraft=new_draft,
                response_text="📱 ¿Cuál es tu número de teléfono?\n\nEjemplo: +34600000000",
            )
        if lower in _NO_WORDS:
            return RouterResult(
                handled=True,
                nextState={"name": "reg_entering_name"},
                nextDraft=dict(draft_raw),
                response_text="¿Cómo te llamas? Escribe tu nombre completo.",
            )
        attempts = int(str(current_state_raw.get("invalid_attempts", 0))) + 1
        if attempts >= 3:
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                nextDraft={},
                response_text="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                + get_main_menu_text(),
            )
        return RouterResult(
            handled=True,
            nextState={"name": "reg_confirming_name", "invalid_attempts": attempts},
            nextDraft=dict(draft_raw),
            response_text=(f"Tu nombre registrado es *{client_name}*.\n¿Es correcto? Responde *sí* o *no*."),
        )

    if current_state_name == "reg_entering_name":
        if not user_text:
            return RouterResult(
                handled=True,
                nextState={"name": "reg_entering_name"},
                nextDraft=dict(draft_raw),
                response_text="Por favor escribe tu nombre completo.",
            )
        new_draft2: dict[str, object] = {**dict(draft_raw), "reg_name": user_text}
        return RouterResult(
            handled=True,
            nextState={"name": "reg_collecting_phone"},
            nextDraft=new_draft2,
            response_text="📱 ¿Cuál es tu número de teléfono?\n\nEjemplo: +34600000000",
        )

    if current_state_name == "reg_collecting_phone":
        if not user_text:
            return RouterResult(
                handled=True,
                nextState={"name": "reg_collecting_phone"},
                nextDraft=dict(draft_raw),
                response_text="Por favor escribe tu número de teléfono.",
            )
        new_draft3: dict[str, object] = {**dict(draft_raw), "reg_phone": user_text}
        return RouterResult(
            handled=True,
            nextState={"name": "reg_collecting_email"},
            nextDraft=new_draft3,
            response_text=("📧 ¿Tienes correo electrónico? (opcional)\n\nEscríbelo o envía *saltar* para omitirlo."),
        )

    if current_state_name == "reg_collecting_email":
        reg_name = str(draft_raw.get("reg_name") or client_name)
        reg_phone = str(draft_raw.get("reg_phone") or "")
        reg_email: str | None = None if lower in _SKIP_WORDS or lower in _NO_WORDS else user_text

        return RouterResult(
            handled=True,
            nextState={"name": "idle"},
            nextDraft={},
            registration_data={"name": reg_name, "phone": reg_phone, "email": reg_email},
            response_text=("✅ ¡Registro completado!\n\nYa puedes agendar tu hora. 🗓️\n\n" + get_main_menu_text()),
        )

    return RouterResult(handled=False)


@beartype
async def _route(input_data: RouterInput) -> RouterResult:
    state_dict = input_data.state or {}
    active_flow = cast("str | None", state_dict.get("active_flow"))

    user_input = input_data.user_input
    is_callback = ":" in user_input or user_input in ["back", "cancel", "cfm:yes", "cfm:no"]

    if user_input.strip() == "/start":
        return RouterResult(
            handled=True,
            active_flow="booking",
            nextState={"name": "idle"},
            response_text=_get_start_text(),
        )

    current_state_raw = cast("dict[str, object]", state_dict.get("booking_state") or {"name": "idle"})
    current_state_name = str(current_state_raw.get("name", "idle"))

    # Guard: if ai_agent determined no FSM routing needed and we're idle, skip
    if not input_data.requires_fsm_routing and current_state_name == "idle":
        return RouterResult(handled=False)

    # Allow idle processing when requires_fsm_routing is True (booking intent from idle)
    if not active_flow and not is_callback and current_state_name != "idle":
        return RouterResult(handled=False)

    if active_flow and active_flow != "booking":
        return RouterResult(handled=False)

    draft_raw = cast("dict[str, object]", state_dict.get("booking_draft") or {})

    # Registration states must be checked before BookingStateRoot.model_validate
    if current_state_name in REG_STATES:
        return _handle_registration_state(input_data, current_state_name, current_state_raw, draft_raw)

    if current_state_name == "reminders_config" or user_input.startswith("rem:"):
        return await handle_reminders_config(input_data, current_state_raw)

    await ensure_nlu_cache()

    try:
        # Handle booking intent from idle — translate to keyword-based FSM
        if current_state_name == "idle" and not is_callback:
            ai_conf = input_data.ai_confidence or 0.0
            intent = ""
            if input_data.ai_intent and ai_conf > 0.6:
                intent = input_data.ai_intent
            else:
                nlu_res = classify_intent(user_input.strip())
                intent = str(nlu_res["intent"]) if nlu_res["confidence"] > 0.6 else ""

            if intent in ("crear_cita", "ver_disponibilidad"):
                if not input_data.phone:
                    return _start_registration(input_data, source="agendar", draft_raw=draft_raw)
                current_state_name = "selecting_specialty"
                current_state_raw = {"name": "selecting_specialty"}
            elif intent in ("mis_citas", "ver_mis_citas") or intent in ("cancelar_cita", "reagendar_cita"):
                return await _handle_mis_citas(input_data, current_state_raw)
            elif intent == "mostrar_menu_principal":
                return RouterResult(
                    handled=True,
                    nextState=current_state_raw,
                    response_text=get_main_menu_text(),
                )
            else:
                return RouterResult(handled=False)

        # Block transition to time-slot selection if client already has an active booking
        if current_state_name == "selecting_doctor" and input_data.prefetch_block_reason == "already_booked":
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                response_text=(
                    "⚠️ Ya tienes una cita agendada.\n\n"
                    "Debes cancelar tu cita actual antes de reservar una nueva.\n\n" + get_main_menu_text()
                ),
            )

        state_root = BookingStateRoot.model_validate(current_state_raw)
        current_state = state_root.root

        # Strip registration keys so DraftBooking(extra="forbid") doesn't reject them
        booking_draft_raw = {k: v for k, v in draft_raw.items() if not k.startswith("reg_")}
        draft = DraftBooking.model_validate(booking_draft_raw)

        action = parse_callback_data(user_input) if is_callback else parse_action(user_input)

        if not action:
            return RouterResult(handled=False)

        prefetched_items = list(input_data.items) if input_data.items is not None else None
        outcome = apply_transition(current_state, action, draft, items=prefetched_items)

        if not outcome:
            return RouterResult(handled=False)

        return RouterResult(
            handled=True,
            response_text=outcome["responseText"],
            nextState=cast("dict[str, object]", outcome["nextState"].model_dump()) if outcome["nextState"] else None,
            nextDraft=None,
            inline_buttons=cast("list[list[InlineButton]] | None", outcome.get("inlineButtons")),
            edit_message=is_callback,
        )

    except Exception as e:
        log("ROUTER_INTERNAL_ERROR", error=str(e), chat_id=input_data.chat_id, module=MODULE)
        raise RuntimeError(f"Router internal error: {e}") from e


async def _main_async(args: dict[str, object]) -> dict[str, object]:
    """Windmill entrypoint."""
    try:
        input_data = RouterInput.model_validate(args)
    except Exception as e:
        raise RuntimeError(f"Router validation error: {e}") from e

    result = await _route(input_data)
    return {"data": cast("dict[str, object]", result.model_dump())}


def main(args: dict[str, object]) -> dict[str, object]:
    import asyncio

    return asyncio.run(_main_async(args))
