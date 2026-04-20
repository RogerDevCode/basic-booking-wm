import type { BookingRow, ServiceRow } from '../internal/db-types/index';
import type { Result } from '../internal/result/index';
import { withTenantContext } from '../internal/tenant-context/index';
import { type Input, type RescheduleWriteResult, type Sql } from "./types";

export async function executeReschedule(sql: Sql, input: Input, oldBooking: BookingRow, service: ServiceRow): Promise<Result<RescheduleWriteResult>> {
    const newStart = input.new_start_time;
    const newEnd = new Date(newStart.getTime() + service.duration_minutes * 60 * 1000);
    const newKey = `reschedule-${oldBooking.idempotency_key}-${String(Date.now())}`;
    return withTenantContext(sql, oldBooking.provider_id, async (tx) => {
    // 1. Conflict Check (Inside transaction + FOR UPDATE implicit in GIST if we wanted, but logic check is safer)
    const overlaps = await tx`
      SELECT booking_id FROM bookings
      WHERE provider_id = ${oldBooking.provider_id}::uuid
        AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
        AND booking_id != ${oldBooking.booking_id}::uuid
        AND start_time < ${newEnd.toISOString()}::timestamptz
        AND end_time > ${newStart.toISOString()}::timestamptz
      LIMIT 1
    `;
    if (overlaps[0]) return [new Error('New time slot is already booked'), null];

    // 2. Create New Booking
    const newRows = await tx<Pick<BookingRow, 'booking_id' | 'status' | 'start_time' | 'end_time'>[]>`
      INSERT INTO bookings (
        client_id, provider_id, service_id,
        start_time, end_time, status, idempotency_key, rescheduled_from,
        gcal_sync_status, notification_sent
      ) VALUES (
        ${oldBooking.client_id}::uuid, ${oldBooking.provider_id}::uuid, ${service.service_id}::uuid,
        ${newStart.toISOString()}::timestamptz, ${newEnd.toISOString()}::timestamptz,
        'confirmed', ${newKey}, ${oldBooking.booking_id}::uuid,
        'pending', false
      )
      RETURNING booking_id, status, start_time, end_time
    `;
    const nb = newRows[0];
    if (!nb) return [new Error('Failed to create new booking'), null];

    // 3. Update Old Booking
    const updRows = await tx<Pick<BookingRow, 'booking_id' | 'status'>[]>`
      UPDATE bookings
      SET status = 'rescheduled', updated_at = NOW()
      WHERE booking_id = ${oldBooking.booking_id}::uuid
      RETURNING booking_id, status
    `;
    const ub = updRows[0];
    if (!ub) return [new Error('Failed to update old booking'), null];

    // 4. Audit Rows (Use unsafe for custom insert if needed, but tx template is better)
    await tx`
      INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
      VALUES (
        ${oldBooking.booking_id}::uuid, ${oldBooking.status}, 'rescheduled', 
        ${input.actor}, ${input.actor_id ?? null}::uuid, 
        ${input.reason ?? 'Rescheduled'}, 
        ${JSON.stringify({ new_booking_id: nb.booking_id })}::jsonb
      )
    `;

    await tx`
      INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
      VALUES (
        ${nb.booking_id}::uuid, null, 'confirmed', 
        ${input.actor}, ${input.actor_id ?? null}::uuid, 
        'Created via reschedule', 
        ${JSON.stringify({ old_booking_id: oldBooking.booking_id })}::jsonb
      )
    `;

    return [null, {
      new_booking_id: nb.booking_id,
      new_status: nb.status,
      new_start_time: nb.start_time,
      new_end_time: nb.end_time,
      old_booking_id: ub.booking_id,
      old_status: ub.status,
    }];
    });
}
