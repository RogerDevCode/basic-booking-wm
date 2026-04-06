// ============================================================================
// BOOKING RESCHEDULE — Cancel old booking + create new one atomically
// ============================================================================
// Reschedules a booking by running ALL 4 DB operations in a single
// sql.begin() transaction:
//   1. INSERT new booking
//   2. UPDATE old booking to 'rescheduled'
//   3. INSERT audit for old booking
//   4. INSERT audit for new booking
//
// Atomic: if ANY step fails, ALL steps rollback. No partial state.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

type Sql = postgres.Sql;

const InputSchema = z.object({
  booking_id: z.uuid(),
  new_start_time: z.coerce.date(),
  new_service_id: z.uuid().optional(),
  actor: z.enum(['client', 'provider', 'system']),
  actor_id: z.uuid().optional(),
  reason: z.string().max(500).optional(),
});

interface RescheduleResult {
  old_booking_id: string;
  new_booking_id: string;
  old_status: string;
  new_status: string;
  old_start_time: string;
  new_start_time: string;
  new_end_time: string;
}

// --- Typed Row Interfaces ---
interface OldBookingRow {
  booking_id: string;
  status: string;
  client_id: string;
  provider_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  idempotency_key: string;
}

interface ServiceRow {
  service_id: string;
  duration_minutes: number;
}

interface OverlapRow {
  booking_id: string;
}

interface InsertedBookingRow {
  booking_id: string;
  status: string;
  start_time: string;
  end_time: string;
}

interface UpdatedBookingRow {
  booking_id: string;
  status: string;
}

const RESCHEDULABLE_STATUSES = ['pending', 'confirmed'];

async function validateSlot(
  sql: Sql,
  providerId: string,
  startTime: string,
  durationMinutes: number,
  excludeBookingId: string
): Promise<{ available: boolean; error?: string }> {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const [overlap] = await sql<OverlapRow[]>`
    SELECT booking_id FROM bookings
    WHERE provider_id = ${providerId}::uuid
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND booking_id != ${excludeBookingId}::uuid
      AND start_time < ${end.toISOString()}::timestamptz
      AND end_time > ${start.toISOString()}::timestamptz
    LIMIT 1
  `;
  if (overlap) return { available: false, error: 'New time slot is already booked' };
  return { available: true };
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: RescheduleResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { booking_id, new_start_time, new_service_id, actor, actor_id, reason } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
    }

    const sql = postgres(dbUrl, { ssl: 'require' });

    try {
      const newStartDateTime = new_start_time;
      const [oldBooking] = await sql<OldBookingRow[]>`
        SELECT booking_id, status, client_id, provider_id, service_id,
               start_time, end_time, idempotency_key
        FROM bookings
        WHERE booking_id = ${booking_id}::uuid
        LIMIT 1
      `;

      if (!oldBooking) {
        return { success: false, data: null, error_message: `Booking ${booking_id} not found` };
      }

      if (!RESCHEDULABLE_STATUSES.includes(oldBooking.status)) {
        return {
          success: false,
          data: null,
          error_message: `Cannot reschedule booking with status '${oldBooking.status}'. Only ${RESCHEDULABLE_STATUSES.join(', ')} allowed.`,
        };
      }

      if (actor === 'client' && oldBooking.client_id !== actor_id) {
        return { success: false, data: null, error_message: 'Unauthorized: client_id mismatch' };
      }
      if (actor === 'provider' && oldBooking.provider_id !== actor_id) {
        return { success: false, data: null, error_message: 'Unauthorized: provider_id mismatch' };
      }

      const serviceId = new_service_id ?? oldBooking.service_id;
      const [service] = await sql<ServiceRow[]>`
        SELECT service_id, duration_minutes FROM services
        WHERE service_id = ${serviceId}::uuid AND is_active = true LIMIT 1
      `;
      if (!service) {
        return { success: false, data: null, error_message: `Service ${serviceId} not found or inactive` };
      }

      const slotCheck = await validateSlot(
        sql, oldBooking.provider_id, newStartDateTime.toISOString(), service.duration_minutes, booking_id
      );
      if (!slotCheck.available) {
        return { success: false, data: null, error_message: slotCheck.error ?? 'Slot not available' };
      }

      const newStartTime = newStartDateTime;
      const newEndTime = new Date(newStartTime.getTime() + service.duration_minutes * 60 * 1000);
      const newIdempotencyKey = `reschedule-${oldBooking.idempotency_key}-${String(Date.now())}`;

      // ALL 4 writes in one atomic transaction:
      const [newBooking, updatedOld] = await sql.begin(async (tx) => {
        const q = tx as unknown as postgres.Sql;
        // 1. Create new booking
        const newRows = await q<InsertedBookingRow[]>`
          INSERT INTO bookings (
            client_id, provider_id, service_id,
            start_time, end_time, status, idempotency_key, rescheduled_from,
            gcal_sync_status, notification_sent,
            reminder_24h_sent, reminder_2h_sent, reminder_30min_sent
          ) VALUES (
            ${oldBooking.client_id}::uuid, ${oldBooking.provider_id}::uuid, ${serviceId}::uuid,
            ${newStartTime.toISOString()}::timestamptz, ${newEndTime.toISOString()}::timestamptz,
            'confirmed', ${newIdempotencyKey}, ${booking_id}::uuid,
            'pending', false, false, false, false
          )
          RETURNING booking_id, status, start_time, end_time
        `;
        const nb = newRows[0];
        if (!nb) throw new Error('Failed to create new booking');

        // 2. Update old booking to rescheduled
        const updRows = await q<UpdatedBookingRow[]>`
          UPDATE bookings
          SET status = 'rescheduled', rescheduled_to = ${nb.booking_id}::uuid, updated_at = NOW()
          WHERE booking_id = ${booking_id}::uuid
          RETURNING booking_id, status
        `;
        const uo = updRows[0];
        if (!uo) throw new Error('Failed to update old booking status');

        // 3. Audit for old booking
        await q`
          INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
          VALUES (
            ${booking_id}::uuid, ${oldBooking.status}, 'rescheduled',
            ${actor}, ${actor_id ?? null}::uuid,
            ${reason ?? 'Rescheduled to new time'},
            ${JSON.stringify({ new_booking_id: nb.booking_id })}::jsonb
          )
        `;

        // 4. Audit for new booking
        await q`
          INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
          VALUES (
            ${nb.booking_id}::uuid, null, 'confirmed',
            ${actor}, ${actor_id ?? null}::uuid,
            'Created via reschedule',
            ${JSON.stringify({ old_booking_id: booking_id })}::jsonb
          )
        `;

        return [nb, uo] as [InsertedBookingRow, UpdatedBookingRow];
      });

      return {
        success: true,
        data: {
          old_booking_id: updatedOld.booking_id,
          new_booking_id: newBooking.booking_id,
          old_status: oldBooking.status,
          new_status: newBooking.status,
          old_start_time: oldBooking.start_time,
          new_start_time: newBooking.start_time,
          new_end_time: newBooking.end_time,
        },
        error_message: null,
      };
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const msg = error.message;
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return { success: false, data: null, error_message: 'Idempotency key conflict' };
    }
    if (msg.includes('booking_no_overlap') || msg.includes('exclusion constraint') || msg.includes('overlaps')) {
      return { success: false, data: null, error_message: 'This time slot was just booked. Please choose a different time.' };
    }
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  }
}
