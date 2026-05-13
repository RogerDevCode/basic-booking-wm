# /// script
# requires-python = ">=3.13"
# dependencies = ["pydantic>=2.10.0", "beartype>=0.19.0", "returns>=0.24.0", "redis>=7.4.0"]
# ///
from __future__ import annotations

from typing import Final, cast

from f.nlu._tfidf_classifier import classify_intent as _nlu_classify

from ..._nlu_cache import ensure_nlu_cache
from ..._wmill_adapter import log
from ...booking_fsm._fsm_machine import (
    apply_transition,
    extract_draft_from_state,
    get_main_menu_text,
    parse_action,
    parse_callback_data,
)
from ...booking_fsm._fsm_models import BookingStateRoot, DraftBooking
from .._router_models import RouterInput, RouterResult

MODULE: Final[str] = "telegram_router"

_NLU_ROUTE_THRESHOLD: Final[float] = 0.5
_NLU_BOOKING_INTENTS: Final[frozenset[str]] = frozenset({"crear_cita", "ver_disponibilidad"})
_NLU_MIS_CITAS_INTENTS: Final[frozenset[str]] = frozenset({"ver_mis_citas"})


async def _nlu_fallback(
    input_data: RouterInput,
    current_state_raw: dict[str, object],
    draft_raw: dict[str, object],
) -> RouterResult:
    """NLU fallback for unrecognized idle messages."""
    lower = input_data.user_input.strip().lower()
    nlu = _nlu_classify(lower)
    intent = nlu["intent"]
    confidence = nlu["confidence"]

    if confidence < _NLU_ROUTE_THRESHOLD:
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=("Lo siento, no entendí esa opción. 😊\n\n" + get_main_menu_text()),
        )

    if intent in _NLU_BOOKING_INTENTS:
        if not input_data.phone:
            from ._registration_handler import handle as handle_registration

            return await handle_registration(input_data)
        return RouterResult(handled=False)  # has phone → fall through to FSM

    if intent in _NLU_MIS_CITAS_INTENTS:
        from ._menu_handler import handle as handle_menu

        return await handle_menu(input_data)

    if intent == "saludo":
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=("¡Hola! 👋 ¿En qué puedo ayudarte?\n\n" + get_main_menu_text()),
        )

    if intent == "despedida":
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text="¡Hasta luego! 👋 Que tengas un buen día.",
        )

    if intent == "agradecimiento":
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=("¡De nada! Estoy aquí si necesitas algo. 😊\n\n" + get_main_menu_text()),
        )

    if intent == "urgencia":
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=(
                "⚠️ Parece que tienes una urgencia.\n\n"
                "Para atención inmediata, llama directamente al consultorio.\n\n" + get_main_menu_text()
            ),
        )

    return RouterResult(
        handled=True,
        nextState=current_state_raw,
        response_text=("Entiendo lo que necesitas. Selecciona una opción:\n\n" + get_main_menu_text()),
    )


async def handle(input_data: RouterInput) -> RouterResult:
    state_dict = input_data.state or {}
    current_state_raw = cast("dict[str, object]", state_dict.get("booking_state", {"name": "idle"}))
    current_state_name = str(current_state_raw.get("name", "idle"))
    draft_raw = cast("dict[str, object]", state_dict.get("booking_draft", {}))

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

    user_input = input_data.user_input
    is_callback = ":" in user_input or user_input in ["back", "cancel", "cfm:yes", "cfm:no"]

    # Strip registration keys so DraftBooking(extra="forbid") doesn't reject them
    booking_draft_raw = {k: v for k, v in draft_raw.items() if not k.startswith("reg_")}

    await ensure_nlu_cache()

    # If idle and not callback, try NLU fallback before FSM
    if current_state_name == "idle" and not is_callback:
        lower = user_input.strip().lower()
        # Check if input matches agendar keywords → pass through to FSM
        from ._menu_handler import _AGENDAR_KEYWORDS, _matches

        if not _matches(lower, _AGENDAR_KEYWORDS):
            return await _nlu_fallback(input_data, current_state_raw, draft_raw)

    try:
        state_root = BookingStateRoot.model_validate(current_state_raw)
        current_state = state_root.root
        draft = DraftBooking.model_validate(booking_draft_raw)

        action = parse_callback_data(user_input) if is_callback else parse_action(user_input)

        if not action:
            return RouterResult(handled=False)

        prefetched_items = list(input_data.items) if input_data.items is not None else None
        try:
            outcome = apply_transition(current_state, action, draft, items=prefetched_items)
        except Exception as e:
            log("FSM_TRANSITION_ERROR", error=str(e), chat_id=input_data.chat_id)
            return RouterResult(
                handled=True,
                response_text="Lo siento, hubo un error procesando tu solicitud.",
            )

        if not outcome:
            return RouterResult(handled=False)

        next_state = outcome["nextState"]
        next_draft = extract_draft_from_state(next_state)

        return RouterResult(
            handled=True,
            response_text=outcome["responseText"],
            nextState=cast("dict[str, object]", next_state.model_dump()) if next_state else None,
            nextDraft=cast("dict[str, object]", next_draft.model_dump()),
            inline_buttons=[],
        )

    except Exception as e:
        log("ROUTER_INTERNAL_ERROR", error=str(e), chat_id=input_data.chat_id, module=MODULE)
        return RouterResult(handled=False)
