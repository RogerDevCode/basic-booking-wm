from datetime import datetime
from typing import List, cast
from ..internal._result import DBClient
from ._reminder_models import BookingRecord, ReminderWindow

async def get_bookings_for_window(
    db: DBClient,
    window: ReminderWindow,
    start: datetime,
    end: datetime
) -> List[BookingRecord]:
    sent_column = f"reminder_{window}_sent"
    
    rows = await db.fetch(
        f"""
        SELECT
          b.booking_id, b.client_id, b.provider_id,
          b.start_time, b.end_time, b.status,
          b.reminder_24h_sent, b.reminder_2h_sent, b.reminder_30min_sent,
          p.telegram_chat_id AS client_telegram_chat_id,
          p.email AS client_email,
          p.name AS client_name,
          p.metadata AS reminder_preferences,
          pr.name AS provider_name,
          s.name AS service_name
        FROM bookings b
        JOIN clients p ON p.client_id = b.client_id
        LEFT JOIN providers pr ON pr.provider_id = b.provider_id
        LEFT JOIN services s ON s.service_id = b.service_id
        WHERE b.status = 'confirmed'
          AND b.start_time >= $1::timestamptz
          AND b.start_time <= $2::timestamptz
          AND b.{sent_column} = false
        ORDER BY b.start_time ASC
        LIMIT 100
        """,
        start, end
    )
    
    return [cast(BookingRecord, r) for r in rows]

async def mark_reminder_sent(db: DBClient, booking_id: str, window: ReminderWindow) -> None:
    column = f"reminder_{window}_sent"
    await db.execute(
        f"UPDATE bookings SET {column} = true, updated_at = NOW() WHERE booking_id = $1::uuid",
        booking_id
    )
