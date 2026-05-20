# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic>=2.10.0",
#   "asyncpg>=0.30.0",
#   "redis>=7.4.0",
#   "beartype>=0.19.0",
#   "httpx>=0.28.1"
# ]
# ///
from __future__ import annotations

import asyncio
import contextlib
import traceback
from typing import Any, Final

from pydantic import BaseModel, ConfigDict

from ...rag_query.main import run_rag_query
from .._booking_shared import get_mis_citas_text
from .._nlu_cache import ensure_nlu_cache
from .._wmill_adapter import log
from ..booking_fsm._fsm_machine import get_main_menu_text

MODULE: Final[str] = "conversational_router"


def _format_menu_with_user_info(name: str | None = None, phone: str | None = None) -> str:
    user_info_lines: list[str] = []
    if name:
        user_info_lines.append(f"👤 {name}")
    if phone:
        user_info_lines.append(f"📞 {phone}")
    info_block = "\n".join(user_info_lines) + "\n\n" if user_info_lines else ""
    return info_block + get_main_menu_text()


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
    "ver_mis_datos": "mis_datos",
    "activar_recordatorios": "recordatorios",
    "desactivar_recordatorios": "recordatorios",
    "preferencias_recordatorio": "recordatorios",
}


async def _handle(inp: ConversationalInput) -> ConversationalResult:
    # D3: Guard anti-callback/anti-start (should never reach here, but for robustness)
    if (
        ":" in inp.user_input
        or inp.user_input.startswith("/")
        or inp.user_input in ["back", "cancel", "cfm:yes", "cfm:no"]
    ):
        return ConversationalResult(handled=False)

    await ensure_nlu_cache()
    handler = _INTENT_TO_HANDLER.get(inp.ai_intent, "rag")
    state_raw: dict[str, object] = {"name": inp.current_state_name}

    # D4: Special handling for urgency (escalation instead of RAG)
    if inp.ai_intent == "urgencia":
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text=(
                "🚨 *Atención de Urgencia*\n\n"
                "Si estás experimentando una emergencia médica real, por favor acude de inmediato "
                "al centro asistencial más cercano o llama al servicio de emergencias.\n\n"
                "Para agendar una cita prioritaria hoy, selecciona la opción 1."
            ),
        )

    if handler == "greeting":
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text="¡Hola! 👋\n\n" + _format_menu_with_user_info(inp.client_name, inp.phone),
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
            response_text="¡Con gusto! 😊\n\n" + _format_menu_with_user_info(inp.client_name, inp.phone),
        )

    if handler == "menu":
        return ConversationalResult(
            handled=True,
            nextState={"name": "idle"},
            response_text=_format_menu_with_user_info(inp.client_name, inp.phone),
        )

    if handler == "mis_citas":
        if not inp.client_id or not inp.pg_url:
            return ConversationalResult(
                handled=True,
                nextState=state_raw,
                response_text="📋 *Mis Horas*\n\nNo pude cargar tus citas en este momento.",
            )

        text = await get_mis_citas_text(inp.client_id, inp.pg_url, inp.chat_id)
        if not text:
            return ConversationalResult(
                handled=True,
                nextState=state_raw,
                response_text="📋 *Mis Horas*\n\nNo tienes horas agendadas próximamente.",
            )

        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text=text + "\n\n" + get_main_menu_text(),
        )

    if handler == "mis_datos":
        if not inp.phone:
            # Note: Registration is still triggered by FSM router for Option 1.
            # For Option 5, we can show a message or redirect to FSM if we want.
            # Simplified: show not registered.
            return ConversationalResult(
                handled=True,
                nextState=state_raw,
                response_text=(
                    "👤 *Mis Datos*\n\nAún no estás registrado. "
                    "Para agendar horas necesito tu número de teléfono.\n\n" + get_main_menu_text()
                ),
            )
        return ConversationalResult(
            handled=True,
            nextState=state_raw,
            response_text=(
                "👤 *Mis Datos*\n\n"
                f"📛 Nombre: {inp.client_name or 'No registrado'}\n"
                "📱 Teléfono: ✅ Registrado\n\n"
                "Para actualizar tu información, contáctanos.\n\n" + get_main_menu_text()
            ),
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
                parts = [f"📖 *{entry['title']}*\n\n{entry['content']}" for entry in rag_result["entries"]]
                return ConversationalResult(
                    handled=True,
                    nextState={"name": "información"},
                    response_text="\n\n---\n\n".join(parts) + "\n\n_Escribe *menú* para volver._",
                )
        except Exception as e:
            # EB-06 intentional graceful degradation: a RAG/DB failure must not
            # abort a purely conversational reply. We log it and fall through to
            # the static info message below so the user still gets a response.
            log("RAG_FALLBACK", error=str(e), module=MODULE)

    return ConversationalResult(
        handled=True,
        nextState={"name": "información"},
        response_text=(
            "\U00002139️ *Información*\n\n"
            "Soy tu asistente de reservas médicas. Puedes agendar una hora, "
            "ver tus horas, configurar recordatorios o preguntar por horarios y servicios.\n\n" + get_main_menu_text()
        ),
    )


async def _main_async(args: dict[str, Any]) -> dict[str, Any]:
    inp = ConversationalInput.model_validate(args)
    result = await _handle(inp)
    return {"data": result.model_dump()}


def main(args: dict[str, Any]) -> dict[str, Any]:
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        with contextlib.suppress(Exception):
            log("CRITICAL_CONVERSATIONAL_ROUTER_FAIL", error=str(e), traceback=tb, module=MODULE)
        raise RuntimeError(f"Conversational router failed: {e}") from e
