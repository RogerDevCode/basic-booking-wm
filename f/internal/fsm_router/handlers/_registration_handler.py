from __future__ import annotations

from typing import Final

from ..._wmill_adapter import log
from .._router_models import RouterInput, RouterResult

MODULE = "registration_handler"
REG_STATES: Final[frozenset[str]] = frozenset(
    {
        "needs_registration",
        "reg_confirming_name",
        "reg_entering_name",
        "reg_collecting_phone",
        "reg_collecting_email",
    }
)


async def handle(input_data: RouterInput) -> RouterResult:
    """Redirect unregistered users to registration flow before booking."""
    log("REGISTRATION_REQUIRED", chat_id=input_data.chat_id, module=MODULE)
    draft_raw: dict[str, object] = {}
    new_draft: dict[str, object] = {**draft_raw, "reg_source": "agendar"}
    return RouterResult(
        handled=True,
        nextState={"name": "needs_registration"},
        nextDraft=new_draft,
        active_flow="booking",
        response_text=(
            "Para agendar una cita necesito registrarte primero.\n\n"
            "Solo necesito tu número de teléfono. Es rápido. 😊\n\n"
            "¿Empezamos? Responde *sí* para continuar o *no* para volver al menú."
        ),
    )
