# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "asyncpg>=0.30.0",
#   "beartype>=0.19.0",
# ]
# ///
from __future__ import annotations

import zoneinfo
from datetime import UTC, datetime
from typing import Final

from ._wmill_adapter import log

MODULE: Final[str] = "booking_shared"

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


async def query_my_bookings(client_id: str, pg_url: str) -> list[dict[str, object]]:
    from ._db_client import create_db_client as _factory

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
              AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled', 'completed')
              AND b.start_time > NOW()
            ORDER BY b.start_time ASC
            LIMIT 5
            """,
            client_id,
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_mis_citas_text(client_id: str, pg_url: str, chat_id: str) -> str | None:
    """Returns the formatted text for 'Mis Citas' or None if error/no results."""
    try:
        rows = await query_my_bookings(client_id, pg_url)
    except Exception as e:
        log("MY_BOOKINGS_QUERY_ERROR", error=str(e), chat_id=chat_id, module=MODULE)
        return None

    if not rows:
        return None

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
    return header + body
