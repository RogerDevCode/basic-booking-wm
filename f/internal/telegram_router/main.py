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

from typing import Final, cast

from beartype import beartype
from returns.result import Failure, Result, Success

from .._wmill_adapter import log
from ..booking_fsm._fsm_machine import apply_transition, parse_action, parse_callback_data
from ..booking_fsm._fsm_models import BookingStateRoot, DraftBooking
from ._router_models import RouterInput, RouterResult

MODULE: Final[str] = "telegram_router"


@beartype
async def _route(input_data: RouterInput) -> Result[RouterResult, str]:
    # 1. Check if we have an active flow
    state_dict = input_data.state or {}
    active_flow = cast("str | None", state_dict.get("active_flow"))

    user_input = input_data.user_input
    is_callback = ":" in user_input or user_input in ["back", "cancel", "cfm:yes", "cfm:no"]

    # Handle /start — initialize booking flow regardless of current state
    if user_input.strip() == "/start":
        return Success(
            RouterResult(
                handled=True,
                active_flow="booking",
                nextState={"name": "idle"},
                response_text=(
                    "¡Hola! Soy tu asistente de reservas.\n\n"
                    "Puedo ayudarte a *agendar*, *consultar* o *cancelar* una cita.\n\n"
                    "¿Qué deseas hacer hoy?"
                ),
            )
        )

    if not active_flow and not is_callback:
        return Success(RouterResult(handled=False))

    # 2. Parse current state and draft
    try:
        # Simplified: for now we only support 'booking' flow
        if active_flow and active_flow != "booking":
            return Success(RouterResult(handled=False))

        # Reconstruct state model from dict
        current_state_raw = cast("dict[str, object]", state_dict.get("booking_state") or {"name": "idle"})
        state_root = BookingStateRoot.model_validate(current_state_raw)
        current_state = state_root.root

        draft_raw = cast("dict[str, object]", state_dict.get("booking_draft") or {})
        draft = DraftBooking.model_validate(draft_raw)

        # 3. Parse action
        action = parse_callback_data(user_input) if is_callback else parse_action(user_input)

        if not action:
            return Success(RouterResult(handled=False))

        # 4. Apply transition — pass pre-fetched items if available
        prefetched_items = list(input_data.items) if input_data.items is not None else None
        err, outcome = apply_transition(current_state, action, draft, items=prefetched_items)

        if err:
            log("FSM_TRANSITION_ERROR", error=str(err), chat_id=input_data.chat_id)
            return Success(
                RouterResult(handled=True, response_text="Lo siento, hubo un error procesando tu solicitud.")
            )

        if not outcome:
            return Success(RouterResult(handled=False))

        # 5. Return result
        return Success(
            RouterResult(
                handled=True,
                response_text=outcome["responseText"],
                nextState=cast("dict[str, object]", outcome["nextState"].model_dump())
                if outcome["nextState"]
                else None,
                nextDraft=None,  # Should be handled by FSM
                inline_buttons=[],
            )
        )

    except Exception as e:
        log("ROUTER_INTERNAL_ERROR", error=str(e), chat_id=input_data.chat_id, module=MODULE)
        return Success(RouterResult(handled=False))


async def _main_async(args: dict[str, object]) -> dict[str, object]:
    """Windmill entrypoint."""
    try:
        input_data = RouterInput.model_validate(args)
    except Exception as e:
        return {"data": {"handled": False, "error": f"validation_error: {e}"}}

    res = await _route(input_data)
    match res:
        case Success(val):
            return {"data": cast("dict[str, object]", val.model_dump())}
        case Failure(err):
            return {"data": {"handled": False, "error": str(err)}}

    return {"data": {"handled": False}}


def main(args: dict[str, object]) -> dict[str, object]:
    import asyncio

    return asyncio.run(_main_async(args))
