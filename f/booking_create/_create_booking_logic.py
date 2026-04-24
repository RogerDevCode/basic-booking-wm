from datetime import timedelta, datetime
from typing import cast
from ..internal._result import Result, ok, fail
from ..internal._state_machine import validate_transition
from ._booking_create_models import InputSchema, BookingCreated, BookingContext
from ._booking_create_repository import BookingCreateRepository

async def fetch_booking_context(
    repo: BookingCreateRepository,
    input_data: InputSchema
) -> Result[BookingContext]:
    client_ctx = await repo.get_client_context(input_data.client_id)
    if not client_ctx:
        return fail(Exception(f"Client {input_data.client_id} not found"))

    provider_ctx = await repo.get_provider_context(input_data.provider_id)
    if not provider_ctx:
        return fail(Exception(f"Provider {input_data.provider_id} not found or inactive"))

    service_ctx = await repo.get_service_context(input_data.service_id, input_data.provider_id)
    if not service_ctx:
        return fail(Exception(f"Service {input_data.service_id} not found or inactive for this provider"))

    return ok(cast(BookingContext, {
        "client": client_ctx,
        "provider": provider_ctx,
        "service": service_ctx
    }))

async def check_availability(
    repo: BookingCreateRepository,
    input_data: InputSchema,
    end_time: datetime
) -> Result[None]:
    target_date = input_data.start_time.date()
    
    is_blocked = await repo.is_provider_blocked(input_data.provider_id, target_date)
    if is_blocked:
        return fail(Exception(f"Provider unavailable on {target_date}"))

    # getweekday returns 0-6 where 0 is Monday. In JS it's 0 is Sunday.
    # We must match the Postgres day_of_week logic. Postgres extracts 0-6 where 0 is Sunday.
    # Python's isoweekday() is 1-7 (Mon=1, Sun=7).
    # To match Postgres 0=Sun, 1=Mon:
    day_of_week = input_data.start_time.isoweekday() % 7

    is_scheduled = await repo.is_provider_scheduled(input_data.provider_id, day_of_week)
    if not is_scheduled:
        return fail(Exception(f"Provider not available on day {day_of_week}"))

    has_overlap = await repo.has_overlapping_booking(
        input_data.provider_id, 
        input_data.start_time, 
        end_time
    )
    if has_overlap:
        return fail(Exception("This time slot is already booked"))

    return ok(None)

async def persist_booking(
    repo: BookingCreateRepository,
    input_data: InputSchema,
    context: BookingContext,
    end_time: datetime
) -> Result[BookingCreated]:
    
    err, _ = validate_transition("pending", "confirmed")
    if err is not None:
        return fail(err)

    try:
        booking = await repo.insert_booking(
            input_data,
            end_time,
            "confirmed",
            provider_name=context["provider"]["name"],
            service_name=context["service"]["name"],
            client_name=context["client"]["name"]
        )
        return ok(booking)
    except Exception as e:
        return fail(e)

async def execute_create_booking(
    repo: BookingCreateRepository,
    input_data: InputSchema
) -> Result[BookingCreated]:
    
    err_ctx, context = await fetch_booking_context(repo, input_data)
    if err_ctx is not None or context is None:
        return fail(err_ctx or Exception("Failed to load booking context"))

    duration_minutes = context["service"]["duration"]
    end_time = input_data.start_time + timedelta(minutes=duration_minutes)

    err_avail, _ = await check_availability(repo, input_data, end_time)
    if err_avail is not None:
        return fail(err_avail)

    return await persist_booking(repo, input_data, context, end_time)
