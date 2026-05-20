# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=48.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0",
#   "dateparser>=1.2.0",
#   "rapidfuzz>=3.5.2",
#   "jellyfish>=1.0.3"
# ]
# ///
# ///
from __future__ import annotations

from typing import TYPE_CHECKING, Final, cast

from beartype import beartype

if TYPE_CHECKING:
    from ...reminder_config._config_models import InlineButton

from ...nlu._datetime_resolver import resolve_datetime as _resolve_datetime_hybrid
from ...nlu._tfidf_classifier import classify_intent
from .._booking_shared import get_mis_citas_text, resolve_provider_by_name
from .._date_resolver import resolve_date
from .._db_client import create_db_client as _create_db_client
from .._nlu_cache import ensure_nlu_cache
from .._wmill_adapter import log
from ..booking_fsm._fsm_machine import apply_transition, get_main_menu_text, parse_action, parse_callback_data
from ..booking_fsm._fsm_models import BookingStateRoot, DraftBooking, NamedItem
from ..booking_fsm._fsm_responses import build_specialty_prompt
from ..booking_prefetch.main import (
    _fetch_slots_for_doctor as _prefetch_slots,
)
from ..booking_prefetch.main import (
    _has_active_booking_for_provider as _prefetch_active_booking,
)
from ._router_models import RouterInput, RouterResult
from ._router_reminders import handle_reminders_config
from .handlers._registration_handler import REG_STATES

MODULE: Final[str] = "fsm_router"

# Intents that can interrupt an active FSM flow (safety net in fsm_router)
_FSM_INTERRUPT_INTENTS: frozenset[str] = frozenset(
    {
        "cancelar_cita",
        "saludo",
        "despedida",
        "agradecimiento",
        "mostrar_menu_principal",
        "ver_mis_citas",
        "ver_mis_datos",
        "activar_recordatorios",
        "pregunta_general",
        "urgencia",
    }
)
_FSM_INTERRUPT_THRESHOLD: float = 0.7


async def _has_active_booking_for_provider(client_id: str, provider_id: str, pg_url: str) -> bool:
    """Wrapper around prefetch's _has_active_booking_for_provider with own DB conn."""
    db = await _create_db_client(pg_url)
    try:
        return await _prefetch_active_booking(db, client_id, provider_id)
    finally:
        await db.close()


async def _fetch_slots_for_doctor(
    pg_url: str,
    doctor_id: str,
    target_date: str | None = None,
) -> list[dict[str, object]]:
    """Wrapper around prefetch's _fetch_slots_for_doctor with own DB conn."""
    db = await _create_db_client(pg_url)
    try:
        return await _prefetch_slots(db, doctor_id, target_date)
    finally:
        await db.close()


def _get_start_text(name: str | None = None, phone: str | None = None) -> str:
    greeting = f"¡Hola, {name}! 👋" if name else "¡Hola! 👋"
    user_info_lines: list[str] = []
    if name:
        user_info_lines.append(f"👤 {name}")
    if phone:
        user_info_lines.append(f"📞 {phone}")
    info_block = "\n".join(user_info_lines) + "\n\n" if user_info_lines else ""
    return f"{greeting} Soy tu asistente de reservas.\n\n{info_block}" + get_main_menu_text()


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


# Native Telegram "share contact" button payload
_PHONE_REPLY_KEYBOARD: list[list[object]] = [
    [{"text": "📱 Compartir mi número", "request_contact": True}],
    [{"text": "✏️ Escribir manualmente"}],
]


def _start_phone_only(
    input_data: RouterInput,
    draft_raw: dict[str, object],
) -> RouterResult:
    """Client exists in DB but has no phone. Ask only for phone — skip name."""
    new_draft: dict[str, object] = {**draft_raw, "reg_source": "agendar", "reg_name": input_data.client_name or ""}
    name = input_data.client_name or "amigo"
    return RouterResult(
        handled=True,
        nextState={"name": "reg_collecting_phone"},
        nextDraft=new_draft,
        active_flow="booking",
        reply_keyboard=_PHONE_REPLY_KEYBOARD,
        response_text=(
            f"Hola, {name}! 👋\n\n"
            "Para confirmar tu reserva necesito tu teléfono de contacto.\n\n"
            "📱 Toca el botón o escríbelo manualmente:"
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


async def _handle_smart_prefill(
    input_data: RouterInput,
    draft_raw: dict[str, object],
) -> RouterResult:
    """Smart pre-fill: resolve provider from AI entities and skip steps."""
    entities = input_data.ai_entities
    provider_name_raw = entities.get("provider_name")
    if not provider_name_raw or not input_data.pg_url:
        return RouterResult(handled=False)

    provider_name = str(provider_name_raw)
    if not input_data.pg_url:
        return RouterResult(handled=False)

    try:
        matches = await resolve_provider_by_name(provider_name, input_data.pg_url)
    except Exception:
        log("SMART_PREFILL_RESOLVE_FAILED", chat_id=input_data.chat_id, module=MODULE)
        return RouterResult(handled=False)

    if not matches:
        display = provider_name.strip().title()
        return RouterResult(
            handled=True,
            nextState={"name": "idle"},
            response_text=(
                f"No encontré a *{display}* en nuestro sistema. 🔍\n\n"
                "¿Deseas buscar por especialidad médica?\n\n" + get_main_menu_text()
            ),
        )

    if len(matches) > 1:
        items_list = [{"id": str(m["provider_id"]), "name": str(m["name"])} for m in matches]
        names = ", ".join(str(m["name"]) for m in matches)
        return RouterResult(
            handled=True,
            nextState={
                "name": "selecting_doctor",
                "specialtyId": "",
                "specialtyName": "Selecciona un doctor",
                "items": items_list,
            },
            response_text=(f"Encontré varios doctores con ese nombre: {names}.\n\n¿Con cuál deseas agendar?"),
        )

    provider = matches[0]
    provider_id = str(provider["provider_id"])
    specialty_id = str(provider["specialty_id"])
    specialty_name = str(provider["specialty_name"])
    doctor_name = str(provider["name"])

    if input_data.client_id:
        try:
            has_active = await _has_active_booking_for_provider(input_data.client_id, provider_id, input_data.pg_url)
        except Exception:
            has_active = False
        if has_active:
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                response_text=(
                    "⚠️ Ya tienes una cita agendada con este doctor.\n\n"
                    "Debes cancelar tu cita actual antes de reservar una nueva.\n\n" + get_main_menu_text()
                ),
            )

    # Resolve target date from AI entities (e.g., "viernes" → "2026-05-22")
    target_date: str | None = None
    date_entity = entities.get("date")
    if date_entity:
        try:
            # Get provider timezone for accurate date resolution
            db = await _create_db_client(input_data.pg_url)
            try:
                tz_row = await db.fetchrow(
                    "SELECT t.name as tz_name FROM providers p"
                    " LEFT JOIN timezones t ON t.id = p.timezone_id"
                    " WHERE p.provider_id = $1::uuid",
                    provider_id,
                )
                provider_tz = str(tz_row["tz_name"]) if tz_row and tz_row["tz_name"] else "America/Santiago"
            finally:
                await db.close()

            # Hybrid pipeline: fuzzy+phonetic+dateparser+LLM fallback
            date_str = str(date_entity)
            hybrid_result = _resolve_datetime_hybrid(date_str, provider_tz=provider_tz)
            if hybrid_result.intent_detected and hybrid_result.datetime_iso:
                target_date = hybrid_result.datetime_iso[:10]
            else:
                # Fallback to deterministic resolver for simple cases
                target_date = resolve_date(date_str, {"timezone": provider_tz})
        except Exception:
            log("DATE_RESOLUTION_FAILED", date=str(date_entity), chat_id=input_data.chat_id, module=MODULE)
            target_date = None

    try:
        slots = await _fetch_slots_for_doctor(input_data.pg_url, provider_id, target_date)
    except Exception:
        log("SMART_PREFETCH_SLOTS_FAILED", chat_id=input_data.chat_id, module=MODULE)
        slots = []

    draft = DraftBooking(
        specialty_id=specialty_id,
        specialty_name=specialty_name,
        doctor_id=provider_id,
        doctor_name=doctor_name,
        target_date=target_date or (str(entities.get("date")) if entities.get("date") else None),
    )

    if slots:
        date_label = ""
        if target_date:
            date_label = f" para el {target_date}"
        return RouterResult(
            handled=True,
            nextState={
                "name": "selecting_time",
                "specialtyId": specialty_id,
                "doctorId": provider_id,
                "doctorName": doctor_name,
                "items": slots,
            },
            nextDraft=cast("dict[str, object]", draft.model_dump()),
            response_text=(f"Encontré al *{doctor_name}* ({specialty_name}). Horarios disponibles{date_label}:"),
        )

    date_msg = f" para el {target_date}" if target_date else " esta semana"
    return RouterResult(
        handled=True,
        nextState={"name": "selecting_specialty"},
        nextDraft=cast("dict[str, object]", draft.model_dump()),
        response_text=(
            f"El *{doctor_name}* no tiene horarios disponibles{date_msg}.\n\n"
            "¿Te gustaría ver otras especialidades o elegir otro doctor?"
        ),
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
                reply_keyboard=_PHONE_REPLY_KEYBOARD,
                response_text="Por favor comparte o escribe tu número de teléfono.",
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
async def _route_impl(input_data: RouterInput) -> RouterResult:
    state_dict = input_data.state or {}
    active_flow = cast("str | None", state_dict.get("active_flow"))

    user_input = input_data.user_input
    is_callback = ":" in user_input or user_input in ["back", "cancel", "cfm:yes", "cfm:no"]

    if user_input.strip() == "/start":
        return RouterResult(
            handled=True,
            active_flow="booking",
            nextState={"name": "idle"},
            response_text=_get_start_text(input_data.client_name, input_data.phone),
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

    # Defensive fix: Redis Lua cjson serializes empty lists as {} instead of []
    # Convert back to [] for known list fields to prevent Pydantic validation errors
    if isinstance(current_state_raw.get("items"), dict):
        current_state_raw["items"] = []
    if isinstance(draft_raw.get("items"), dict):
        draft_raw["items"] = []

    # Registration states must be checked before BookingStateRoot.model_validate
    if current_state_name in REG_STATES:
        return _handle_registration_state(input_data, current_state_name, current_state_raw, draft_raw)

    if current_state_name == "reminders_config" or user_input.startswith("rem:"):
        return await handle_reminders_config(input_data, current_state_raw)

    await ensure_nlu_cache()

    # Flow-interrupt safety net: if AI detected a clear non-booking intent,
    # handle it here instead of forcing through FSM transitions.
    # This catches cases where confidence is below the routing threshold
    # but the intent is still unambiguous.
    ai_intent = input_data.ai_intent or ""
    ai_conf = input_data.ai_confidence or 0.0
    if current_state_name != "idle" and ai_intent in _FSM_INTERRUPT_INTENTS and ai_conf >= _FSM_INTERRUPT_THRESHOLD:
        if ai_intent == "cancelar_cita":
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                response_text="He cancelado la reserva en curso.\n\n" + get_main_menu_text(),
            )
        if ai_intent == "mostrar_menu_principal":
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                response_text=get_main_menu_text(),
            )
        if ai_intent == "ver_mis_citas":
            return await _handle_mis_citas(input_data, current_state_raw)
        if ai_intent in ("saludo", "despedida", "agradecimiento"):
            return RouterResult(
                handled=True,
                nextState=current_state_raw,
                response_text=(
                    "Entendido. Cuando quieras continuar con tu reserva, "
                    "responde con la opción que necesitas.\n\n" + get_main_menu_text()
                ),
            )
        if ai_intent in ("ver_mis_datos", "activar_recordatorios", "pregunta_general"):
            return RouterResult(
                handled=True,
                nextState=current_state_raw,
                response_text=(
                    f"He registrado tu consulta ({ai_intent}). "
                    "Para continuar con tu reserva, selecciona una opción del menú.\n\n" + get_main_menu_text()
                ),
            )
        if ai_intent == "urgencia":
            return RouterResult(
                handled=True,
                nextState={"name": "idle"},
                response_text=(
                    "⚠️ He detectado una situación urgente. "
                    "Tu reserva en curso se ha pausado.\n\n" + get_main_menu_text()
                ),
            )

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
                if not input_data.client_id:
                    # No client in DB at all → full registration
                    return _start_registration(input_data, source="agendar", draft_raw=draft_raw)
                if not input_data.phone:
                    # Client exists but no phone → ask only for phone
                    return _start_phone_only(input_data, draft_raw=draft_raw)

                smart_result = await _handle_smart_prefill(input_data, draft_raw)
                if smart_result.handled:
                    return smart_result

                # Intent detected — show specialty list, do NOT apply_transition
                # (user hasn't selected anything yet, just expressed intent)
                specialty_items_raw = list(input_data.items) if input_data.items else []
                specialty_items = cast("list[NamedItem]", specialty_items_raw)
                if specialty_items:
                    response = build_specialty_prompt(specialty_items)
                else:
                    response = "Buscando especialidades disponibles..."
                return RouterResult(
                    handled=True,
                    nextState={"name": "selecting_specialty", "items": specialty_items_raw},
                    response_text=response,
                )
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
@beartype
async def _route(input_data: RouterInput) -> RouterResult:
    result = await _route_impl(input_data)
    if result.handled:
        # Only set active_flow if not already explicitly set by the handler
        if result.active_flow is None:
            next_state_name = "idle"
            if result.nextState:
                next_state_name = str(result.nextState.get("name", "idle"))
            else:
                state_dict = input_data.state or {}
                current_state_raw = cast("dict[str, object]", state_dict.get("booking_state") or {"name": "idle"})
                next_state_name = str(current_state_raw.get("name", "idle"))

            if next_state_name != "idle" and next_state_name != "reminders_config":
                result.active_flow = "booking"
            elif next_state_name == "idle":
                result.active_flow = None
    return result


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
