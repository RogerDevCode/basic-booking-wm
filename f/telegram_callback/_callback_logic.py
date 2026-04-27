from __future__ import annotations

import httpx

from ..internal._result import DBClient, Result, fail, ok
from ..internal._wmill_adapter import log

ACTION_MAP: dict[str, str] = {
    "cnf": "confirm",
    "cxl": "cancel",
    "res": "reagendar_cita",
    "act": "activate_reminders",
    "dea": "deactivate_reminders",
    "ack": "acknowledge",
}


def parse_callback_data(data: str) -> dict[str, str] | None:
    parts = data.split(":")
    if len(parts) != 2:
        return None
    action_code = parts[0]
    booking_id = parts[1]
    if not action_code or not booking_id:
        return None
    action = ACTION_MAP.get(action_code)
    if not action:
        return None
    return {"action": action, "booking_id": booking_id}


async def confirm_booking(db: DBClient, booking_id: str, client_id: str | None) -> Result[bool]:
    rows = await db.fetch(
        """
        SELECT booking_id, status, client_id
        FROM bookings
        WHERE booking_id = $1::uuid
          AND status = 'pending'
        LIMIT 1
        """,
        booking_id,
    )
    if not rows:
        return fail("Booking not found or not in pending status")

    row = rows[0]
    if client_id and str(row["client_id"]) != client_id:
        return fail("Unauthorized: client mismatch")

    await db.execute(
        "UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE booking_id = $1::uuid", booking_id
    )
    await db.execute(
        """
        INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
        VALUES ($1::uuid, $2, 'confirmed', 'client', $3::uuid, 'Confirmed via Telegram inline button')
        """,
        booking_id,
        row["status"],
        client_id,
    )
    return ok(True)


async def update_booking_status(
    db: DBClient, booking_id: str, new_status: str, client_id: str | None, actor: str
) -> Result[bool]:
    rows = await db.fetch(
        """
        SELECT booking_id, status, client_id, start_time, end_time
        FROM bookings
        WHERE booking_id = $1::uuid
          AND status NOT IN ('cancelled', 'completed', 'no_show', 'rescheduled')
        LIMIT 1
        """,
        booking_id,
    )
    if not rows:
        return fail("Booking not found or already terminal")

    row = rows[0]
    if client_id and str(row["client_id"]) != client_id:
        return fail("Unauthorized: client mismatch")

    cancelled_by = actor if new_status == "cancelled" else None
    await db.execute(
        """
        UPDATE bookings
        SET status = $1,
            cancelled_by = $2,
            updated_at = NOW()
        WHERE booking_id = $3::uuid
        """,
        new_status,
        cancelled_by,
        booking_id,
    )

    reason = "Cancelled via Telegram inline button" if new_status == "cancelled" else "Status updated via Telegram"
    await db.execute(
        """
        INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
        VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)
        """,
        booking_id,
        row["status"],
        new_status,
        actor,
        client_id,
        reason,
    )
    return ok(True)


async def answer_callback_query(bot_token: str, callback_query_id: str, text: str, show_alert: bool = False) -> bool:
    url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            payload: dict[str, object] = {
                "callback_query_id": callback_query_id,
                "text": text,
                "show_alert": show_alert,
            }
            res = await client.post(url, json=payload)
            return res.status_code == 200
    except Exception as e:
        log("answer_callback_query failed", error=str(e), module="telegram_callback")
        return False


async def send_followup_message(bot_token: str, chat_id: str, text: str) -> bool:
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload: dict[str, object] = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
            res = await client.post(url, json=payload)
            return res.status_code == 200
    except Exception as e:
        log("send_followup_message failed", error=str(e), module="telegram_callback")
        return False
