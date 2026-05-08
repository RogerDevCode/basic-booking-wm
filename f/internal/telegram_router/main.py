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

import zoneinfo
from datetime import UTC, datetime
from typing import Final, cast

from beartype import beartype
from returns.result import Failure, Result, Success

from .._wmill_adapter import log
from ..booking_fsm._fsm_machine import apply_transition, get_main_menu_text, parse_action, parse_callback_data
from ..booking_fsm._fsm_models import BookingStateRoot, DraftBooking
from ._router_models import RouterInput, RouterResult

MODULE: Final[str] = "telegram_router"


def _get_start_text() -> str:
    return (
        "¡Hola! Soy tu asistente de reservas. 👋\n\n"
        "Puedo ayudarte a agendar, consultar o cancelar una cita médica.\n\n" + get_main_menu_text()
    )


_AGENDAR_KEYWORDS: Final[frozenset[str]] = frozenset(["1", "agendar", "agendar cita", "nueva cita", "cita"])
_MIS_CITAS_KEYWORDS: Final[frozenset[str]] = frozenset(["2", "mis citas", "consultar", "consultar citas", "ver citas"])
_RECORDATORIOS_KEYWORDS: Final[frozenset[str]] = frozenset(["3", "recordatorios", "recordatorio"])
_INFO_KEYWORDS: Final[frozenset[str]] = frozenset(["4", "información", "informacion", "info", "información"])
_MIS_DATOS_KEYWORDS: Final[frozenset[str]] = frozenset(["5", "mis datos", "datos", "mi perfil", "perfil"])

_SI_WORDS: Final[frozenset[str]] = frozenset({"s", "y", "si", "sí", "yes", "ok", "dale", "claro", "correcto", "exacto"})
_NO_WORDS: Final[frozenset[str]] = frozenset({"no", "nope", "nel", "negativo"})

_REG_STATES: Final[frozenset[str]] = frozenset(
    {
        "needs_registration",
        "reg_confirming_name",
        "reg_entering_name",
        "reg_collecting_phone",
        "reg_collecting_email",
    }
)

_SKIP_WORDS: Final[frozenset[str]] = frozenset({"saltar", "skip", "omitir"})


def _start_registration(
    input_data: RouterInput,
    source: str,
    draft_raw: dict[str, object],
) -> Result[RouterResult, str]:
    new_draft: dict[str, object] = {**draft_raw, "reg_source": source}
    return Success(
        RouterResult(
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
    )


_STATUS_LABELS: Final[dict[str, str]] = {
    "confirmed": "✅ Confirmada",
    "pending": "⏳ Pendiente",
    "scheduled": "📅 Agendada",
}

_MONTHS_ES: Final[list[str]] = [
    "",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def _format_booking_line(
    provider_name: str,
    service_name: str,
    start_utc: datetime,
    tz_name: str,
    status: str,
    booking_id: str,
) -> str:
    tz = zoneinfo.ZoneInfo(tz_name)
    local_dt = start_utc.astimezone(tz)
    day = local_dt.day
    month = _MONTHS_ES[local_dt.month]
    time_str = local_dt.strftime("%H:%M")
    status_label = _STATUS_LABELS.get(status, "📋 Agendada")
    raw = booking_id[:8].upper()
    short_id = f"{raw[:2]}-{raw[2:5]}-{raw[5:8]}"
    return (
        f"{status_label}\n"
        f"👨‍⚕️ {provider_name} — {service_name}\n"
        f"📅 {day} de {month} a las {time_str}\n"
        f"🆔 Ref: `{short_id}`"
    )


async def _query_my_bookings(client_id: str, pg_url: str) -> list[dict[str, object]]:
    import os

    from .._db_client import create_db_client as _factory

    os.environ["DATABASE_URL"] = pg_url
    db = await _factory()
    try:
        rows = await db.fetch(
            """
            SELECT
                b.booking_id::text,
                b.start_time,
                b.status,
                p.name  AS provider_name,
                s.name  AS service_name,
                COALESCE(t.name, 'UTC') AS tz_name
            FROM bookings b
            JOIN providers p ON p.provider_id = b.provider_id
            JOIN services  s ON s.service_id  = b.service_id
            LEFT JOIN timezones t ON t.id = p.timezone_id
            WHERE b.client_id = $1::uuid
              AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
              AND b.start_time >= NOW()
            ORDER BY b.start_time ASC
            LIMIT 5
            """,
            client_id,
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def _handle_mis_citas(
    input_data: RouterInput,
    current_state_raw: dict[str, object],
) -> Result[RouterResult, str]:
    if not input_data.client_id or not input_data.pg_url:
        return Success(
            RouterResult(
                handled=True,
                nextState=current_state_raw,
                response_text=(
                    "📋 *Mis Citas*\n\nNo pudimos cargar tus citas en este momento.\n\n" + get_main_menu_text()
                ),
            )
        )

    try:
        rows = await _query_my_bookings(input_data.client_id, input_data.pg_url)
    except Exception:
        rows = []

    if not rows:
        return Success(
            RouterResult(
                handled=True,
                nextState=current_state_raw,
                response_text=(
                    "📋 *Mis Citas*\n\n"
                    "No tienes citas próximas agendadas.\n\n"
                    "Puedes agendar una nueva cita seleccionando la opción 1.\n\n" + get_main_menu_text()
                ),
            )
        )

    lines: list[str] = []
    for r in rows:
        raw_start = r["start_time"]
        if isinstance(raw_start, datetime):
            start_utc = raw_start if raw_start.tzinfo else raw_start.replace(tzinfo=UTC)
        else:
            start_utc = datetime.fromisoformat(str(raw_start).replace("Z", "+00:00"))
        lines.append(
            _format_booking_line(
                provider_name=str(r["provider_name"]),
                service_name=str(r["service_name"]),
                start_utc=start_utc,
                tz_name=str(r["tz_name"]),
                status=str(r["status"]),
                booking_id=str(r["booking_id"]),
            )
        )

    body = "\n\n".join(lines)
    count = len(rows)
    header = f"📋 *Mis Citas* ({count} próxima{'s' if count > 1 else ''})\n\n"

    return Success(
        RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=header + body + "\n\n" + get_main_menu_text(),
        )
    )


def _handle_mis_datos(
    input_data: RouterInput,
    current_state_raw: dict[str, object],
) -> Result[RouterResult, str]:
    if not input_data.phone:
        return _start_registration(input_data, source="mis_datos", draft_raw={})
    return Success(
        RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=(
                "👤 *Mis Datos*\n\n"
                f"📛 Nombre: {input_data.client_name or 'No registrado'}\n"
                "📱 Teléfono: ✅ Registrado\n\n"
                "Para actualizar tu información, contáctanos.\n\n" + get_main_menu_text()
            ),
        )
    )


def _handle_registration_state(
    input_data: RouterInput,
    current_state_name: str,
    current_state_raw: dict[str, object],
    draft_raw: dict[str, object],
) -> Result[RouterResult, str]:
    lower = input_data.user_input.strip().lower()
    user_text = input_data.user_input.strip()
    client_name = input_data.client_name or "amigo"

    if current_state_name == "needs_registration":
        if lower in _SI_WORDS:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "reg_confirming_name"},
                    nextDraft=dict(draft_raw),
                    response_text=(
                        f"¡Perfecto! 😊\n\n"
                        f"Tu nombre registrado es *{client_name}*.\n"
                        "¿Es correcto? Responde *sí* o *no*."
                    ),
                )
            )
        if lower in _NO_WORDS:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "idle"},
                    nextDraft={},
                    response_text=(
                        "Entendido. 👍\n\nPuedes registrarte cuando quieras para agendar citas.\n\n"
                        + get_main_menu_text()
                    ),
                )
            )
        attempts = int(str(current_state_raw.get("invalid_attempts", 0))) + 1
        if attempts >= 3:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "idle"},
                    nextDraft={},
                    response_text="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                    + get_main_menu_text(),
                )
            )
        return Success(
            RouterResult(
                handled=True,
                nextState={"name": "needs_registration", "invalid_attempts": attempts},
                nextDraft=dict(draft_raw),
                response_text="¿Empezamos con el registro? Responde *sí* o *no*. 😊",
            )
        )

    if current_state_name == "reg_confirming_name":
        if lower in _SI_WORDS:
            new_draft: dict[str, object] = {**dict(draft_raw), "reg_name": client_name}
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "reg_collecting_phone"},
                    nextDraft=new_draft,
                    response_text="📱 ¿Cuál es tu número de teléfono?\n\nEjemplo: +34600000000",
                )
            )
        if lower in _NO_WORDS:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "reg_entering_name"},
                    nextDraft=dict(draft_raw),
                    response_text="¿Cómo te llamas? Escribe tu nombre completo.",
                )
            )
        attempts = int(str(current_state_raw.get("invalid_attempts", 0))) + 1
        if attempts >= 3:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "idle"},
                    nextDraft={},
                    response_text="❌ Demasiados intentos inválidos. Volviendo al menú principal.\n\n"
                    + get_main_menu_text(),
                )
            )
        return Success(
            RouterResult(
                handled=True,
                nextState={"name": "reg_confirming_name", "invalid_attempts": attempts},
                nextDraft=dict(draft_raw),
                response_text=(f"Tu nombre registrado es *{client_name}*.\n¿Es correcto? Responde *sí* o *no*."),
            )
        )

    if current_state_name == "reg_entering_name":
        if not user_text:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "reg_entering_name"},
                    nextDraft=dict(draft_raw),
                    response_text="Por favor escribe tu nombre completo.",
                )
            )
        new_draft2: dict[str, object] = {**dict(draft_raw), "reg_name": user_text}
        return Success(
            RouterResult(
                handled=True,
                nextState={"name": "reg_collecting_phone"},
                nextDraft=new_draft2,
                response_text="📱 ¿Cuál es tu número de teléfono?\n\nEjemplo: +34600000000",
            )
        )

    if current_state_name == "reg_collecting_phone":
        if not user_text:
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "reg_collecting_phone"},
                    nextDraft=dict(draft_raw),
                    response_text="Por favor escribe tu número de teléfono.",
                )
            )
        new_draft3: dict[str, object] = {**dict(draft_raw), "reg_phone": user_text}
        return Success(
            RouterResult(
                handled=True,
                nextState={"name": "reg_collecting_email"},
                nextDraft=new_draft3,
                response_text=(
                    "📧 ¿Tienes correo electrónico? (opcional)\n\nEscríbelo o envía *saltar* para omitirlo."
                ),
            )
        )

    if current_state_name == "reg_collecting_email":
        reg_name = str(draft_raw.get("reg_name") or client_name)
        reg_phone = str(draft_raw.get("reg_phone") or "")
        reg_email: str | None = None if lower in _SKIP_WORDS or lower in _NO_WORDS else user_text

        return Success(
            RouterResult(
                handled=True,
                nextState={"name": "idle"},
                nextDraft={},
                registration_data={"name": reg_name, "phone": reg_phone, "email": reg_email},
                response_text=("✅ ¡Registro completado!\n\nYa puedes agendar tu cita. 🗓️\n\n" + get_main_menu_text()),
            )
        )

    return Success(RouterResult(handled=False))


@beartype
async def _route(input_data: RouterInput) -> Result[RouterResult, str]:
    state_dict = input_data.state or {}
    active_flow = cast("str | None", state_dict.get("active_flow"))

    user_input = input_data.user_input
    is_callback = ":" in user_input or user_input in ["back", "cancel", "cfm:yes", "cfm:no"]

    if user_input.strip() == "/start":
        return Success(
            RouterResult(
                handled=True,
                active_flow="booking",
                nextState={"name": "idle"},
                response_text=_get_start_text(),
            )
        )

    if not active_flow and not is_callback:
        return Success(RouterResult(handled=False))

    if active_flow and active_flow != "booking":
        return Success(RouterResult(handled=False))

    current_state_raw = cast("dict[str, object]", state_dict.get("booking_state") or {"name": "idle"})
    current_state_name = str(current_state_raw.get("name", "idle"))
    draft_raw = cast("dict[str, object]", state_dict.get("booking_draft") or {})

    # Registration states must be checked before BookingStateRoot.model_validate
    if current_state_name in _REG_STATES:
        return _handle_registration_state(input_data, current_state_name, current_state_raw, draft_raw)

    if current_state_name == "reminders_config" or user_input.startswith("rem:"):
        from ._router_reminders import handle_reminders_config

        return await handle_reminders_config(input_data, current_state_raw)

    from .._nlu_cache import ensure_nlu_cache

    await ensure_nlu_cache()

    try:
        if current_state_name == "idle" and not is_callback:
            lower = user_input.strip().lower()

            if lower in _AGENDAR_KEYWORDS and not input_data.phone:
                return _start_registration(input_data, source="agendar", draft_raw=draft_raw)

            if lower in _MIS_DATOS_KEYWORDS:
                return _handle_mis_datos(input_data, current_state_raw)

            if lower in _MIS_CITAS_KEYWORDS:
                return await _handle_mis_citas(input_data, current_state_raw)

            if lower in _RECORDATORIOS_KEYWORDS:
                from ._router_reminders import handle_reminders_config

                return await handle_reminders_config(input_data, current_state_raw)

            if lower in _INFO_KEYWORDS:
                return Success(
                    RouterResult(
                        handled=True,
                        nextState=current_state_raw,
                        response_text=(
                            "\U00002139️ *Información*\n\n"
                            "Este es tu asistente de reservas médicas.\n"
                            "Puedes agendar, consultar o cancelar citas en cualquier momento.\n\n"
                            + get_main_menu_text()
                        ),
                    )
                )
            if lower not in _AGENDAR_KEYWORDS:
                return Success(
                    RouterResult(
                        handled=True,
                        nextState=current_state_raw,
                        response_text=("Lo siento, no entendí esa opción. 😊\n\n" + get_main_menu_text()),
                    )
                )

        # Block transition to time-slot selection if client already has an active booking
        if current_state_name == "selecting_doctor" and input_data.prefetch_block_reason == "already_booked":
            return Success(
                RouterResult(
                    handled=True,
                    nextState={"name": "idle"},
                    response_text=(
                        "⚠️ Ya tienes una cita agendada.\n\n"
                        "Debes cancelar tu cita actual antes de reservar una nueva.\n\n" + get_main_menu_text()
                    ),
                )
            )

        state_root = BookingStateRoot.model_validate(current_state_raw)
        current_state = state_root.root

        # Strip registration keys so DraftBooking(extra="forbid") doesn't reject them
        booking_draft_raw = {k: v for k, v in draft_raw.items() if not k.startswith("reg_")}
        draft = DraftBooking.model_validate(booking_draft_raw)

        action = parse_callback_data(user_input) if is_callback else parse_action(user_input)

        if not action:
            return Success(RouterResult(handled=False))

        prefetched_items = list(input_data.items) if input_data.items is not None else None
        err, outcome = apply_transition(current_state, action, draft, items=prefetched_items)

        if err:
            log("FSM_TRANSITION_ERROR", error=str(err), chat_id=input_data.chat_id)
            return Success(
                RouterResult(handled=True, response_text="Lo siento, hubo un error procesando tu solicitud.")
            )

        if not outcome:
            return Success(RouterResult(handled=False))

        return Success(
            RouterResult(
                handled=True,
                response_text=outcome["responseText"],
                nextState=cast("dict[str, object]", outcome["nextState"].model_dump())
                if outcome["nextState"]
                else None,
                nextDraft=None,
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
