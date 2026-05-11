from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, cast

from f.availability_check._availability_logic import get_provider, get_provider_service_id
from f.availability_check._availability_models import InputSchema as AvailabilityInputSchema
from f.internal._db_client import create_db_client
from f.internal.scheduling_engine import get_availability
from f.services.booking._booking_errors import (
    BookingAlreadyCancelledError,
    BookingAlreadyRescheduledError,
    BookingNotFoundError,
    BookingPermissionError,
    BookingSlotUnavailableError,
)
from f.services.booking._booking_models import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingRescheduleRequest,
)
from f.services.booking.adapters import GCalClient, TelegramClient
from f.services.booking.core import cancel_booking, create_booking, reschedule_booking
from f.services.booking.repo import PgBookingRepo

if TYPE_CHECKING:
    from f.internal._result import DBClient


async def _handle_crear_cita(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    ctx = await repo.resolve_context(intent)

    client_id = ctx.get("client_id")
    provider_id = ctx.get("provider_id")
    service_id = ctx.get("service_id")
    date_str = ctx.get("date")
    time_str = ctx.get("time")

    if not all([client_id, provider_id, service_id, date_str, time_str]):
        specs = await repo.get_specialties_for_booking()
        inline_buttons: list[list[dict[str, str]]] = []
        current_row: list[dict[str, str]] = []
        msg_parts = ["🏥 *Selecciona la especialidad que necesitas:*\n"]
        for s in specs:
            if s["provider_count"] > 0:
                current_row.append({"text": s["name"], "callback_data": f"spec:{s['id']}"})
                if len(current_row) == 2:
                    inline_buttons.append(current_row)
                    current_row = []
            else:
                msg_parts.append(f"• {s['name']} *(temp. no disp.)*")
        if current_row:
            inline_buttons.append(current_row)
        inline_buttons.append([{"text": "❌ Cancelar", "callback_data": "cancel"}])
        return {
            "action": "crear_cita",
            "success": False,
            "message": "\n".join(msg_parts) if len(msg_parts) > 1 else msg_parts[0],
            "inline_buttons": inline_buttons,
        }

    active = await repo.get_active_booking_for_client(str(client_id), str(provider_id))
    if active:
        st = active["start_time"]
        fmt_time = st.strftime("%d/%m %H:%M") if hasattr(st, "strftime") else str(st)
        msg = (
            f"i*Ya tienes una cita activa*\n\n"
            f"Tienes una cita con *{active['provider_name']}* para el *{fmt_time}*.\n\n"
            f"¿Deseas reagendar esa cita para el nuevo horario "
            f"(*{date_str}* a las *{time_str}*) o prefieres volver al menú?"
        )
        ars_callback = f"ars:{active['booking_id']}:{date_str}:{time_str}"
        return {
            "action": "crear_cita",
            "success": False,
            "message": msg,
            "inline_buttons": [
                [{"text": "🔄 Sí, reagendar cita", "callback_data": ars_callback}],
                [{"text": "« Volver al menú", "callback_data": "cancel"}],
            ],
        }

    start_time_str = f"{date_str}T{time_str}:00"
    try:
        start_dt = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
    except ValueError:
        msg = f"❌ Formato de fecha/hora inválido: {date_str} {time_str}"
        return {"action": "crear_cita", "success": False, "message": msg}
    end_dt = start_dt + timedelta(minutes=30)

    req = BookingCreateRequest(
        client_id=str(client_id),
        provider_id=str(provider_id),
        service_id=str(service_id),
        start_time=start_dt,
        end_time=end_dt,
        idempotency_key=f"orch-{client_id}-{provider_id}-{date_str}-{time_str}",
        notes=intent.get("notes"),
    )
    try:
        res = await create_booking(req, repo, GCalClient(), TelegramClient())
    except BookingSlotUnavailableError:
        return {"action": "crear_cita", "success": False, "message": "❌ Ese horario ya no está disponible."}
    return {
        "action": "crear_cita",
        "success": True,
        "message": f"✅ Cita agendada para el {date_str} a las {time_str}.",
        "data": res.model_dump(),
    }


async def _resolve_client_id(intent: dict[str, Any], conn: DBClient) -> str | None:
    actor_id: str | None = intent.get("actor_id")
    if actor_id:
        return actor_id
    chat_id = intent.get("chat_id") or intent.get("telegram_chat_id")
    if not chat_id:
        return None
    rows = await conn.fetch("SELECT client_id FROM clients WHERE telegram_chat_id = $1 LIMIT 1", str(chat_id))
    return str(rows[0]["client_id"]) if rows else None


async def _handle_cancelar_cita(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    entities: dict[str, Any] = intent.get("entities") or {}
    booking_id = intent.get("booking_id") or entities.get("booking_id")
    if not booking_id:
        return {"action": "cancelar_cita", "success": False, "message": "❌ Necesito el ID de tu cita para cancelarla."}

    client_id = await _resolve_client_id(intent, conn)
    actor_raw = "client" if client_id else intent.get("actor", "system")
    actor = actor_raw if actor_raw in ("client", "provider", "system", "admin") else "system"
    actor_id_raw = client_id or intent.get("actor_id")
    req_cancel = BookingCancelRequest(
        booking_id=booking_id,
        actor=actor,  # type: ignore[arg-type]
        actor_id=str(actor_id_raw) if actor_id_raw is not None else None,
        reason=str(intent.get("reason") or "Cancelled by user"),
    )
    try:
        res = await cancel_booking(req_cancel, repo, GCalClient(), TelegramClient())
    except BookingPermissionError:
        return {"action": "cancelar_cita", "success": False, "message": "❌ No tienes permiso para cancelar esa cita."}
    except (BookingNotFoundError, BookingAlreadyCancelledError) as exc:
        return {"action": "cancelar_cita", "success": False, "message": f"❌ No se pudo cancelar: {exc}"}
    return {
        "action": "cancelar_cita",
        "success": True,
        "message": "✅ Tu cita ha sido cancelada.",
        "data": res.model_dump(),
    }


async def _handle_reagendar_cita(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    entities: dict[str, Any] = intent.get("entities") or {}
    booking_id = intent.get("booking_id") or entities.get("booking_id")
    date_str = intent.get("date") or entities.get("date")
    time_str = intent.get("time") or entities.get("time")

    if not booking_id or not (date_str and time_str):
        return {
            "action": "reagendar_cita",
            "success": False,
            "message": "❌ Necesito el ID de tu cita y el nuevo horario.",
        }

    new_start_time_str = f"{date_str}T{time_str}:00"
    try:
        new_start_dt = datetime.fromisoformat(new_start_time_str.replace("Z", "+00:00"))
    except ValueError:
        msg = f"❌ Formato de fecha/hora inválido: {date_str} {time_str}"
        return {"action": "reagendar_cita", "success": False, "message": msg}
    new_end_dt = new_start_dt + timedelta(minutes=30)

    client_id = await _resolve_client_id(intent, conn)
    actor_raw = "client" if client_id else intent.get("actor", "system")
    actor = actor_raw if actor_raw in ("client", "provider", "system", "admin") else "system"
    actor_id_raw = client_id or intent.get("actor_id")
    req_reschedule = BookingRescheduleRequest(
        booking_id=booking_id,
        new_start_time=new_start_dt,
        new_end_time=new_end_dt,
        actor=actor,  # type: ignore[arg-type]
        actor_id=str(actor_id_raw) if actor_id_raw is not None else None,
    )
    try:
        res = await reschedule_booking(req_reschedule, repo, GCalClient(), TelegramClient())
    except (
        BookingNotFoundError,
        BookingAlreadyCancelledError,
        BookingAlreadyRescheduledError,
        BookingSlotUnavailableError,
        BookingPermissionError,
    ) as exc:
        return {"action": "reagendar_cita", "success": False, "message": f"❌ No se pudo reagendar: {exc}"}
    return {
        "action": "reagendar_cita",
        "success": True,
        "message": f"✅ Cita reagendada para el {date_str} a las {time_str}.",
        "data": res.model_dump(),
    }


async def _handle_ver_disponibilidad(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    entities: dict[str, Any] = intent.get("entities") or {}
    provider_id = intent.get("provider_id") or entities.get("provider_id")
    date_str = intent.get("date") or entities.get("date")

    if not provider_id or not date_str:
        return {
            "action": "ver_disponibilidad",
            "success": False,
            "message": "❌ Necesito el proveedor y la fecha para consultar disponibilidad.",
        }

    validated = AvailabilityInputSchema.model_validate(
        {
            "provider_id": provider_id,
            "date": date_str,
            "tenant_id": intent.get("tenant_id", "default"),
        }
    )
    provider = await get_provider(conn, validated.provider_id)
    if not provider:
        return {"action": "ver_disponibilidad", "success": False, "message": "❌ Proveedor no encontrado."}

    service_id = validated.service_id or await get_provider_service_id(conn, validated.provider_id)
    if not service_id:
        return {
            "action": "ver_disponibilidad",
            "success": False,
            "message": "❌ No hay servicios disponibles para este proveedor.",
        }

    result = await get_availability(
        conn,
        {"provider_id": validated.provider_id, "date": validated.date, "service_id": service_id},
    )
    if not result:
        return {
            "action": "ver_disponibilidad",
            "success": False,
            "message": "❌ No se pudo obtener disponibilidad.",
        }
    return {"action": "ver_disponibilidad", "success": True, "data": result}


async def _handle_mis_citas(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    chat_id = intent.get("chat_id") or intent.get("telegram_chat_id")
    rows = await conn.fetch(
        """
        SELECT b.booking_id, b.start_time, p.name AS provider_name,
               sp.name AS specialty, s.name AS service_name
        FROM bookings b
        JOIN providers p ON b.provider_id = p.provider_id
        JOIN specialties sp ON p.specialty_id = sp.specialty_id
        JOIN services s ON b.service_id = s.service_id
        JOIN clients c ON b.client_id = c.client_id
        WHERE c.telegram_chat_id = $1
          AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled', 'completed')
          AND b.start_time > NOW()
        ORDER BY b.start_time ASC
        LIMIT 5
        """,
        str(chat_id),
    )
    if not rows:
        return {"action": "mis_citas", "success": True, "message": "No tienes citas activas actualmente."}

    lines = ["📋 *Tus próximas citas:*\n"]
    for r in rows:
        short_id = str(r["booking_id"]).replace("-", "").upper()[:9]
        ref = f"{short_id[:2]}-{short_id[2:5]}-{short_id[5:]}"
        st = r["start_time"]
        fmt_time = cast("datetime", st).strftime("%d/%m/%Y %H:%M") if hasattr(st, "strftime") else str(st)
        lines.append(f"• *{r['provider_name']}* ({r['specialty']})\n  📅 {fmt_time}\n  🔖 Ref: `{ref}`")

    return {"action": "mis_citas", "success": True, "message": "\n\n".join(lines)}


async def _handle_consultar_cita(intent: dict[str, Any], conn: DBClient, repo: PgBookingRepo) -> dict[str, Any]:
    entities: dict[str, Any] = intent.get("entities") or {}
    booking_id = intent.get("booking_id") or entities.get("booking_id")
    chat_id = intent.get("chat_id") or intent.get("telegram_chat_id")

    if booking_id:
        row = await conn.fetchrow(
            """
            SELECT b.booking_id, b.start_time, b.status,
                   p.name AS provider_name, sp.name AS specialty, s.name AS service_name
            FROM bookings b
            JOIN providers p ON b.provider_id = p.provider_id
            JOIN specialties sp ON p.specialty_id = sp.specialty_id
            JOIN services s ON b.service_id = s.service_id
            WHERE b.booking_id = $1::uuid
            LIMIT 1
            """,
            booking_id,
        )
    elif chat_id:
        row = await conn.fetchrow(
            """
            SELECT b.booking_id, b.start_time, b.status,
                   p.name AS provider_name, sp.name AS specialty, s.name AS service_name
            FROM bookings b
            JOIN providers p ON b.provider_id = p.provider_id
            JOIN specialties sp ON p.specialty_id = sp.specialty_id
            JOIN services s ON b.service_id = s.service_id
            JOIN clients c ON b.client_id = c.client_id
            WHERE c.telegram_chat_id = $1
              AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled', 'completed')
              AND b.start_time > NOW()
            ORDER BY b.start_time ASC
            LIMIT 1
            """,
            str(chat_id),
        )
    else:
        return {
            "action": "consultar_cita",
            "success": False,
            "message": "❌ Necesito el ID o referencia de tu cita para consultarla.",
        }

    if not row:
        return {
            "action": "consultar_cita",
            "success": False,
            "message": "No encontré una cita activa. ¿Quieres agendar una nueva?",
        }

    short_id = str(row["booking_id"]).replace("-", "").upper()[:9]
    ref = f"{short_id[:2]}-{short_id[2:5]}-{short_id[5:]}"
    st = row["start_time"]
    fmt_time = cast("datetime", st).strftime("%d/%m/%Y %H:%M") if hasattr(st, "strftime") else str(st)
    status_emoji = {"confirmed": "✅", "pending": "⏳", "cancelled": "❌"}.get(str(row["status"]), "i")
    msg = (
        f"\U0001f4cb *Detalle de tu cita*\n\n"
        f"*Doctor:* {row['provider_name']}\n"
        f"*Especialidad:* {row['specialty']}\n"
        f"*Servicio:* {row['service_name']}\n"
        f"*Fecha:* {fmt_time}\n"
        f"*Estado:* {status_emoji} {row['status']}\n"
        f"*Referencia:* `{ref}`"
    )
    return {"action": "consultar_cita", "success": True, "message": msg, "data": dict(row)}


async def route_intent(intent: dict[str, Any]) -> dict[str, Any]:
    """
    Pure service-layer router. Single DB connection for the entire request.
    Routing only — no IO setup outside this function.
    """
    intent_type = str(intent.get("type", "desconocido"))

    if intent_type not in (
        "crear_cita",
        "cancelar_cita",
        "reagendar_cita",
        "reagendar",
        "ver_disponibilidad",
        "mis_citas",
        "consultar_cita",
    ):
        return {
            "action": "desconocido",
            "success": False,
            "message": "No entendí tu solicitud. ¿Podrías ser más específico (ej: 'agendar cita', 'cancelar turno')?",
        }

    conn = await create_db_client()
    try:
        repo = PgBookingRepo(conn)
        if intent_type == "crear_cita":
            return await _handle_crear_cita(intent, conn, repo)
        elif intent_type == "cancelar_cita":
            return await _handle_cancelar_cita(intent, conn, repo)
        elif intent_type in ("reagendar_cita", "reagendar"):
            return await _handle_reagendar_cita(intent, conn, repo)
        elif intent_type == "ver_disponibilidad":
            return await _handle_ver_disponibilidad(intent, conn, repo)
        elif intent_type == "mis_citas":
            return await _handle_mis_citas(intent, conn, repo)
        else:  # consultar_cita
            return await _handle_consultar_cita(intent, conn, repo)
    finally:
        await conn.close()
