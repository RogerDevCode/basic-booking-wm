from typing import Any
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._agenda_models import AgendaResult, AgendaDay, AgendaBooking, InputSchema

async def get_provider_agenda(
    db: DBClient,
    input_data: InputSchema
) -> Result[AgendaResult]:
    try:
        # 1. Fetch provider basic info
        rows = await db.fetch(
            "SELECT provider_id, name FROM providers WHERE provider_id = $1::uuid AND is_active = true LIMIT 1",
            input_data.provider_id
        )
        if not rows:
            return fail("Provider not found or inactive")
        
        provider = rows[0]
        p_name = str(provider["name"])

        # 2. Iterate days
        start_date = date.fromisoformat(input_data.date_from)
        end_date = date.fromisoformat(input_data.date_to)
        
        days: List[AgendaDay] = []
        curr = start_date
        while curr <= end_date:
            date_str = curr.isoformat()
            
            # 2a. Overrides
            ov_rows = await db.fetch(
                "SELECT is_blocked, reason FROM schedule_overrides WHERE provider_id = $1::uuid AND override_date = $2::date LIMIT 1",
                input_data.provider_id, date_str
            )
            is_blocked = bool(ov_rows[0]["is_blocked"]) if ov_rows else False
            reason = str(ov_rows[0]["reason"]) if ov_rows and ov_rows[0].get("reason") else None

            # 2b. Base Schedule
            # Extract DOW (0=Sunday ... 6=Saturday)
            # Python isoweekday: 1=Mon, 7=Sun.
            dow = curr.isoweekday() % 7
            
            sched_rows = await db.fetch(
                "SELECT start_time::text, end_time::text FROM provider_schedules WHERE provider_id = $1::uuid AND day_of_week = $2 AND is_active = true",
                input_data.provider_id, dow
            )
            schedule = [{"start_time": str(s["start_time"]), "end_time": str(s["end_time"])} for s in sched_rows]

            # 2c. Bookings
            if input_data.include_client_details:
                b_rows = await db.fetch(
                    """
                    SELECT b.booking_id, b.start_time, b.end_time, b.status, c.full_name as client_name, s.name as service_name
                    FROM bookings b
                    JOIN services s ON b.service_id = s.service_id
                    LEFT JOIN clients c ON b.client_id = c.client_id
                    WHERE b.provider_id = $1::uuid
                      AND b.start_time >= $2::date
                      AND b.start_time < ($2::date + INTERVAL '1 day')
                      AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
                    ORDER BY b.start_time
                    """,
                    input_data.provider_id, date_str
                )
            else:
                b_rows = await db.fetch(
                    """
                    SELECT b.booking_id, b.start_time, b.end_time, b.status, s.name as service_name
                    FROM bookings b
                    JOIN services s ON b.service_id = s.service_id
                    WHERE b.provider_id = $1::uuid
                      AND b.start_time >= $2::date
                      AND b.start_time < ($2::date + INTERVAL '1 day')
                      AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
                    ORDER BY b.start_time
                    """,
                    input_data.provider_id, date_str
                )
            
            bookings: List[AgendaBooking] = []
            for r in b_rows:
                bookings.append({
                    "booking_id": str(r["booking_id"]),
                    "start_time": r["start_time"].isoformat() if isinstance(r.get("start_time"), datetime) else str(r.get("start_time")),
                    "end_time": r["end_time"].isoformat() if isinstance(r.get("end_time"), datetime) else str(r.get("end_time")),
                    "status": str(r["status"]),
                    "service_name": str(r["service_name"]),
                    "client_name": str(r["client_name"]) if r.get("client_name") else None
                })

            days.append({
                "date": date_str,
                "is_blocked": is_blocked,
                "block_reason": reason,
                "schedule": schedule,
                "bookings": bookings
            })
            
            curr += timedelta(days=1)

        return ok({
            "provider_id": input_data.provider_id,
            "provider_name": p_name,
            "date_from": input_data.date_from,
            "date_to": input_data.date_to,
            "days": days
        })

    except Exception as e:
        return fail(f"agenda_failed: {e}")
