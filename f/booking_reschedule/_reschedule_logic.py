from __future__ import annotations

import time
from datetime import timedelta
from typing import TYPE_CHECKING

from ..internal._result import Result, fail, ok

if TYPE_CHECKING:
    from ._reschedule_models import BookingRow, RescheduleInput, RescheduleWriteResult, ServiceRow
    from ._reschedule_repository import RescheduleRepository


def authorize(input_data: RescheduleInput, old_booking: BookingRow) -> Result[None]:
    """
    Validates that the actor has permission to reschedule the booking.
    """
    try:
        if input_data.actor == "client" and old_booking["client_id"] != input_data.actor_id:
            return fail(Exception("unauthorized: client_id mismatch"))

        if input_data.actor == "provider" and old_booking["provider_id"] != input_data.actor_id:
            return fail(Exception("unauthorized: provider_id mismatch"))

        if input_data.actor == "system":
            pass

        return ok(None)
    except Exception as e:
        return fail(f"authorization_check_failed: {e}")


async def execute_reschedule_logic(
    repo: RescheduleRepository, input_data: RescheduleInput, old_booking: BookingRow, service: ServiceRow
) -> Result[RescheduleWriteResult]:
    """
    Transactional logic for rescheduling.
    """
    try:
        # 1. Time Calculation
        new_start = input_data.new_start_time
        new_end = new_start + timedelta(minutes=service["duration_minutes"])

        # Consistent idempotency key for the new booking
        new_key = f"reschedule-{old_booking['idempotency_key']}-{int(time.time() * 1000)}"

        # 2. Conflict Check (Overlap)
        try:
            overlap = await repo.check_overlap(
                old_booking["provider_id"], old_booking["booking_id"], new_start, new_end
            )
            if overlap:
                return fail("new_time_slot_already_booked")
        except Exception as e:
            return fail(f"db_overlap_check_failed: {e}")

        # 3. Atomic Transaction: Create New + Update Old + Audits
        try:
            write_result = await repo.execute_reschedule(input_data, old_booking, service, new_end, new_key)
            if not write_result:
                return fail("failed_to_execute_reschedule_transaction")
        except Exception as e:
            return fail(f"db_transaction_failed: {e}")

        return ok(write_result)

    except Exception as e:
        return fail(f"unexpected_reschedule_logic_error: {e}")
