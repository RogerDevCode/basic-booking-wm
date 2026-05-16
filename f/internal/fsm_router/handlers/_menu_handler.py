from __future__ import annotations

import zoneinfo
from datetime import UTC, datetime
from typing import Final

from ..._wmill_adapter import log
from ...booking_fsm._fsm_machine import get_main_menu_text
from .._router_models import RouterInput, RouterResult

MODULE = "menu_handler"

_AGENDAR_KEYWORDS: Final[frozenset[str]] = frozenset(
    [
        "1",
        "agendar",
        "agendar hora",
        "agendar cita",
        "nueva hora",
        "nueva cita",
        "hora",
        "cita",
        "pedir hora",
        "tomar hora",
    ]
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


def _matches(text: str, keywords: frozenset[str]) -> bool:
    """Return True if text exactly matches any keyword in the set."""
    return text in keywords


__all__ = ["_AGENDAR_KEYWORDS", "_matches", "handle"]


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
    from f.internal._db_client import create_db_client as _factory

    db = await _factory(pg_url)
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


async def handle(
    input_data: RouterInput,
) -> RouterResult:
    """Handle 'ver mis citas' intent — list upcoming bookings for the client."""
    current_state_raw: dict[str, object] = {}

    if not input_data.client_id or not input_data.pg_url:
        log("MIS_CITAS_MISSING_CONTEXT", chat_id=input_data.chat_id, module=MODULE)
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=("📋 *Mis Horas*\n\nNo pudimos cargar tus horas en este momento.\n\n" + get_main_menu_text()),
        )

    rows = await _query_my_bookings(input_data.client_id, input_data.pg_url)

    if not rows:
        return RouterResult(
            handled=True,
            nextState=current_state_raw,
            response_text=(
                "📋 *Mis Horas*\n\n"
                "No tienes horas próximas agendadas.\n\n"
                "Puedes agendar una nueva hora seleccionando la opción 1.\n\n" + get_main_menu_text()
            ),
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
    header = f"📋 *Mis Horas* ({count} próxima{'s' if count > 1 else ''})\n\n"

    return RouterResult(
        handled=True,
        nextState=current_state_raw,
        response_text=header + body + "\n\n" + get_main_menu_text(),
    )
