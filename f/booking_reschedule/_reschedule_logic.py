import time
from datetime import timedelta

from ..internal._result import Result, fail, ok
from ._reschedule_models import BookingRow, RescheduleInput, RescheduleWriteResult, ServiceRow
from ._reschedule_repository import RescheduleRepository


def authorize(input_data: RescheduleInput, old_booking: BookingRow) -> Result[None]:
    if input_data.actor == "client" and old_booking["client_id"] != input_data.actor_id:
        return fail(Exception("unauthorized: client_id mismatch"))

    if input_data.actor == "provider" and old_booking["provider_id"] != input_data.actor_id:
        return fail(Exception("unauthorized: provider_id mismatch"))

    return ok(None)


async def execute_reschedule_logic(
    repo: RescheduleRepository, input_data: RescheduleInput, old_booking: BookingRow, service: ServiceRow
) -> Result[RescheduleWriteResult]:

    new_start = input_data.new_start_time
    new_end = new_start + timedelta(minutes=service["duration_minutes"])
    new_key = f"reschedule-{old_booking['idempotency_key']}-{int(time.time() * 1000)}"

    # 1. Conflict Check
    overlap = await repo.check_overlap(old_booking["provider_id"], old_booking["booking_id"], new_start, new_end)
    if overlap:
        return fail(Exception("New time slot is already booked"))

    # 2. Create New Booking & Update Old Booking & Insert Audits
    write_result = await repo.execute_reschedule(input_data, old_booking, service, new_end, new_key)

    if not write_result:
        return fail(Exception("failed_to_execute_reschedule_transaction"))

    return ok(write_result)
