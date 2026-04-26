from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import cast

from .._result import DBClient, Result, fail, ok
from ._scheduling_models import (
    AffectedBooking,
    AvailabilityQuery,
    AvailabilityResult,
    BookingTimeRow,
    OverrideValidation,
    ProviderScheduleRow,
    ScheduleOverrideRow,
    ServiceRow,
    TimeSlot,
)


def time_to_minutes(time_str: str) -> int:
    """Converts HH:MM[:SS] to minutes from start of day."""
    parts = time_str.split(":")
    hours = int(parts[0]) if len(parts) > 0 else 0
    minutes = int(parts[1]) if len(parts) > 1 else 0
    return hours * 60 + minutes


def generate_slots_for_rule(
    rule: ProviderScheduleRow, target_date: str, slot_duration_min: int, bookings: list[BookingTimeRow]
) -> list[TimeSlot]:
    slots: list[TimeSlot] = []
    start_min = time_to_minutes(rule["start_time"])
    end_min = time_to_minutes(rule["end_time"])

    # Parse target date
    try:
        y, m, d = map(int, target_date.split("-"))
    except (ValueError, AttributeError):
        return []

    # Prepare booking ranges as (start_ts, end_ts) for faster lookup
    booking_ranges = []
    for b in bookings:
        # asyncpg returns datetime objects for timestamptz
        # We ensure they are UTC and then get timestamp
        b_start = b["start_time"]
        b_end = b["end_time"]

        # If they are strings (unlikely with asyncpg but possible if mocked)
        if isinstance(b_start, str):
            b_start_dt = datetime.fromisoformat(b_start.replace("Z", "+00:00"))
        else:
            b_start_dt = cast(datetime, b_start)

        if isinstance(b_end, str):
            b_end_dt = datetime.fromisoformat(b_end.replace("Z", "+00:00"))
        else:
            b_end_dt = cast(datetime, b_end)

        booking_ranges.append((b_start_dt.timestamp(), b_end_dt.timestamp()))

    current_min = start_min
    while current_min + slot_duration_min <= end_min:
        slot_start_dt = datetime(y, m, d, current_min // 60, current_min % 60, tzinfo=timezone.utc)
        slot_end_dt = slot_start_dt + timedelta(minutes=slot_duration_min)

        slot_start_ts = slot_start_dt.timestamp()
        slot_end_ts = slot_end_dt.timestamp()

        is_booked = any(slot_start_ts < b_end and slot_end_ts > b_start for b_start, b_end in booking_ranges)

        slots.append(
            {
                "start": slot_start_dt.isoformat().replace("+00:00", "Z"),
                "end": slot_end_dt.isoformat().replace("+00:00", "Z"),
                "available": not is_booked,
            }
        )

        current_min += slot_duration_min

    return slots


async def get_availability(db: DBClient, query: AvailabilityQuery) -> Result[AvailabilityResult]:
    target_date = query["date"]

    try:
        # Determine day of week (0=Sun, ..., 6=Sat) to match Postgres
        dt = datetime.fromisoformat(target_date)
        day_of_week = dt.isoweekday() % 7

        # 1. Layer 2: Overrides
        override_rows = await db.fetch(
            """
            SELECT override_id, provider_id, override_date, is_blocked, 
                   start_time::text, end_time::text, reason
            FROM schedule_overrides
            WHERE provider_id = $1::uuid
              AND override_date = $2::date
            """,
            query["provider_id"],
            target_date,
        )

        overrides = cast(list[ScheduleOverrideRow], override_rows)
        blocking_override = next((o for o in overrides if o["is_blocked"]), None)

        if blocking_override:
            return ok(
                AvailabilityResult(
                    provider_id=query["provider_id"],
                    date=target_date,
                    timezone="UTC",
                    slots=[],
                    total_available=0,
                    total_booked=0,
                    is_blocked=True,
                    block_reason=blocking_override["reason"] or "Día no disponible",
                )
            )

        special_override = next(
            (o for o in overrides if not o["is_blocked"] and o["start_time"] and o["end_time"]), None
        )

        # 2. Layer 1: Schedule Rules
        rules: list[ProviderScheduleRow]
        if special_override:
            rules = [
                {
                    "id": 0,
                    "provider_id": query["provider_id"],
                    "day_of_week": day_of_week,
                    "start_time": cast(str, special_override["start_time"]),
                    "end_time": cast(str, special_override["end_time"]),
                }
            ]
        else:
            rule_rows = await db.fetch(
                """
                SELECT schedule_id as id, provider_id, day_of_week, 
                       start_time::text, end_time::text
                FROM provider_schedules
                WHERE provider_id = $1::uuid
                  AND day_of_week = $2
                  AND is_active = True
                """,
                query["provider_id"],
                day_of_week,
            )
            rules = cast(list[ProviderScheduleRow], rule_rows)

        if not rules:
            return ok(
                AvailabilityResult(
                    provider_id=query["provider_id"],
                    date=target_date,
                    timezone="UTC",
                    slots=[],
                    total_available=0,
                    total_booked=0,
                    is_blocked=True,
                    block_reason="No hay horario para este día de la semana",
                )
            )

        # 3. Layer 3: Bookings
        booking_rows = await db.fetch(
            """
            SELECT start_time, end_time FROM bookings
            WHERE provider_id = $1::uuid
              AND start_time >= $2::date
              AND start_time < ($2::date + INTERVAL '1 day')
              AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
            """,
            query["provider_id"],
            target_date,
        )
        bookings = cast(list[BookingTimeRow], booking_rows)

        # 4. Service details
        service_rows = await db.fetch(
            "SELECT service_id, duration_minutes, buffer_minutes FROM services WHERE service_id = $1::uuid LIMIT 1",
            query["service_id"],
        )
        if not service_rows:
            return fail(f"Service not found: {query['service_id']}")

        service = cast(ServiceRow, service_rows[0])
        slot_duration = service["duration_minutes"] + service["buffer_minutes"]

        # 5. Generate slots
        all_slots: list[TimeSlot] = []
        for rule in rules:
            rule_slots = generate_slots_for_rule(rule, target_date, slot_duration, bookings)
            all_slots.extend(rule_slots)

        available_count = len([s for s in all_slots if s["available"]])
        booked_count = len(all_slots) - available_count

        return ok(
            AvailabilityResult(
                provider_id=query["provider_id"],
                date=target_date,
                timezone="UTC",
                slots=all_slots,
                total_available=available_count,
                total_booked=booked_count,
                is_blocked=False,
                block_reason=None,
            )
        )

    except Exception as e:
        return fail(e)


async def get_availability_range(
    db: DBClient, provider_id: str, service_id: str, date_from: str, date_to: str
) -> Result[list[AvailabilityResult]]:
    results: list[AvailabilityResult] = []

    try:
        curr_dt = date.fromisoformat(date_from)
        end_dt = date.fromisoformat(date_to)
    except ValueError as e:
        return fail(f"Invalid date format: {e}")

    iter_date = curr_dt
    while iter_date <= end_dt:
        date_str = iter_date.isoformat()
        err, res = await get_availability(
            db, {"provider_id": provider_id, "date": date_str, "service_id": service_id}
        )
        if err:
            return fail(err)
        if res:
            results.append(res)

        iter_date += timedelta(days=1)

    return ok(results)


async def validate_override(db: DBClient, provider_id: str, date_start: str, date_end: str) -> Result[OverrideValidation]:
    try:
        rows = await db.fetch(
            """
            SELECT b.booking_id, b.start_time, p.name as client_name
            FROM bookings b
            JOIN clients p ON p.client_id = b.client_id
            WHERE b.provider_id = $1::uuid
              AND b.start_time >= $2::date
              AND b.start_time < ($3::date + INTERVAL '1 day')
              AND b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
            """,
            provider_id,
            date_start,
            date_end,
        )

        affected: list[AffectedBooking] = [
            {
                "booking_id": str(r["booking_id"]),
                "start_time": r["start_time"].isoformat()
                if isinstance(r["start_time"], datetime)
                else str(r["start_time"]),
                "client_name": str(r["client_name"]),
            }
            for r in rows
        ]

        return ok(
            OverrideValidation(
                hasBookings=len(affected) > 0,
                bookingCount=len(affected),
                affectedBookings=affected,
            )
        )
    except Exception as e:
        return fail(e)
