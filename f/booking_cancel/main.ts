// ============================================================================
// BOOKING CANCEL — Cancel an existing medical appointment
// ============================================================================
// Go-style: no throw for control flow, no any, no as.
// All errors returned as Error values. All DB operations use typed interfaces.
// Uses tx.unsafe() with parameterized queries inside transactions (no generic overload).
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import type { UUID } from '../internal/db-types';

// ─── Input Validation ───────────────────────────────────────────────────────
const InputSchema = z.object({
  booking_id: z.uuid(),
  actor: z.enum(['patient', 'provider', 'system']),
  actor_id: z.uuid().optional(),
  reason: z.string().max(500).optional(),
});

type CancelBookingInput = z.infer<typeof InputSchema>;

// ─── Output Types ───────────────────────────────────────────────────────────
export interface CancelResult {
  readonly booking_id: UUID;
  readonly previous_status: string;
  readonly new_status: string;
  readonly cancelled_by: string;
  readonly cancellation_reason: string | null;
}

// ─── Typed Row Interfaces ───────────────────────────────────────────────────
interface BookingLookup {
  readonly booking_id: string;
  readonly status: string;
  readonly patient_id: string;
  readonly provider_id: string;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_patient_event_id: string | null;
}

interface UpdatedBooking {
  readonly booking_id: string;
  readonly status: string;
  readonly cancelled_by: string;
  readonly cancellation_reason: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const CANCELLABLE_STATUSES: readonly string[] = ['pending', 'confirmed'];

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<{ success: boolean; data: CancelResult | null; error_message: string | null }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const input: Readonly<CancelBookingInput> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // 1. Find booking
    const bookingRows = await sql<BookingLookup[]>`
      SELECT booking_id, status, patient_id, provider_id,
             gcal_provider_event_id, gcal_patient_event_id
      FROM bookings
      WHERE booking_id = ${input.booking_id}::uuid
      LIMIT 1
    `;
    const bookingRow = bookingRows[0];
    if (bookingRow === undefined) {
      return { success: false, data: null, error_message: `Booking ${input.booking_id} not found` };
    }

    const booking: BookingLookup = bookingRow;

    // 2. Validate cancellable state
    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      return {
        success: false,
        data: null,
        error_message: `Cannot cancel booking with status '${booking.status}'. Only pending, confirmed bookings can be cancelled.`,
      };
    }

    // 3. Validate actor permission
    if (input.actor === 'patient' && booking.patient_id !== input.actor_id) {
      return { success: false, data: null, error_message: 'Unauthorized: patient_id mismatch' };
    }
    if (input.actor === 'provider' && booking.provider_id !== input.actor_id) {
      return { success: false, data: null, error_message: 'Unauthorized: provider_id mismatch' };
    }

    // 4. Update status + audit trail atomically
    let updated: UpdatedBooking | undefined;
    let txError: Error | undefined;

    try {
      updated = await sql.begin(async (tx) => {
        const updRows: unknown[] = await tx.unsafe(
          `UPDATE bookings
           SET status = 'cancelled',
               cancelled_by = $1,
               cancellation_reason = $2,
               updated_at = NOW()
           WHERE booking_id = $3::uuid
           RETURNING booking_id, status, cancelled_by, cancellation_reason`,
          [input.actor, input.reason ?? null, input.booking_id]
        );

        const updRow: UpdatedBooking | undefined = updRows[0] as UpdatedBooking | undefined;
        if (updRow === undefined) {
          throw new Error('Failed to update booking status');
        }

        await tx.unsafe(
          `INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
           VALUES ($1::uuid, $2, 'cancelled', $3, $4::uuid, $5, $6::jsonb)`,
          [
            input.booking_id,
            booking.status,
            input.actor,
            input.actor_id ?? null,
            input.reason ?? 'Cancelled via API',
            JSON.stringify({
              gcal_provider_event_id: booking.gcal_provider_event_id,
              gcal_patient_event_id: booking.gcal_patient_event_id,
            }),
          ]
        );

        return {
          booking_id: updRow.booking_id,
          status: updRow.status,
          cancelled_by: updRow.cancelled_by,
          cancellation_reason: updRow.cancellation_reason,
        };
      });
    } catch (e) {
      txError = e instanceof Error ? e : new Error(String(e));
    }

    if (txError !== undefined || updated === undefined) {
      return { success: false, data: null, error_message: txError?.message ?? 'Unknown transaction error' };
    }

    // 5. Mark GCal events for cleanup
    if (booking.gcal_provider_event_id !== null || booking.gcal_patient_event_id !== null) {
      await sql`
        UPDATE bookings
        SET gcal_sync_status = 'pending', gcal_retry_count = 0
        WHERE booking_id = ${input.booking_id}::uuid
      `;
    }

    return {
      success: true,
      data: {
        booking_id: updated.booking_id as UUID,
        previous_status: booking.status,
        new_status: updated.status,
        cancelled_by: updated.cancelled_by,
        cancellation_reason: updated.cancellation_reason,
      },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${message}` };
  } finally {
    await sql.end();
  }
}
