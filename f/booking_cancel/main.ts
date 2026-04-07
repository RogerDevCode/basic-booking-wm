// ============================================================================
// BOOKING CANCEL — Cancel an existing medical appointment
// ============================================================================
// Go-style: no throw for control flow, no any, no as.
// All errors returned as Error values. All DB operations use withTenantContext.
// Uses tx.unsafe() with parameterized queries inside transactions.
// Enforces state machine transitions via shared module.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import type { UUID } from '../internal/db-types';
import { toUUID } from '../internal/db-types';
import { withTenantContext } from '../internal/tenant-context';
import { validateTransition } from '../internal/state-machine';
import { createDbClient } from '../internal/db/client';

// ─── Input Validation ───────────────────────────────────────────────────────
const InputSchema = z.object({
  booking_id: z.uuid(),
  actor: z.enum(['client', 'provider', 'system']),
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
  readonly client_id: string;
  readonly provider_id: string;
  readonly gcal_provider_event_id: string | null;
  readonly gcal_client_event_id: string | null;
}

interface UpdatedBooking {
  readonly booking_id: string;
  readonly status: string;
  readonly cancelled_by: string;
  readonly cancellation_reason: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────
// Note: CANCELLABLE_STATUSES removed. State machine validation is now used.

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, CancelResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<CancelBookingInput> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // 1. Find booking (admin read — booking_id acts as capability token)
    const bookingRows = await sql.values<[string, string, string, string, string | null, string | null][]>`
      SELECT booking_id, status, client_id, provider_id,
             gcal_provider_event_id, gcal_client_event_id
      FROM bookings
      WHERE booking_id = ${input.booking_id}::uuid
      LIMIT 1
    `;
    const bookingRow = bookingRows[0];
    if (bookingRow === undefined) {
      return [new Error(`Booking ${input.booking_id} not found`), null];
    }

    const booking: BookingLookup = {
      booking_id: bookingRow[0],
      status: bookingRow[1],
      client_id: bookingRow[2],
      provider_id: bookingRow[3],
      gcal_provider_event_id: bookingRow[4],
      gcal_client_event_id: bookingRow[5],
    };

    // 2. Validate state machine transition
    const [transitionErr] = validateTransition(booking.status, 'cancelled');
    if (transitionErr !== null) {
      return [transitionErr, null];
    }

    // 3. Validate actor permission
    if (input.actor === 'client' && booking.client_id !== input.actor_id) {
      return [new Error('Unauthorized: client_id mismatch'), null];
    }
    if (input.actor === 'provider' && booking.provider_id !== input.actor_id) {
      return [new Error('Unauthorized: provider_id mismatch'), null];
    }

    // 4. Update status + audit trail atomically under tenant context
    const [txErr, updated] = await withTenantContext<UpdatedBooking>(
      sql,
      booking.provider_id,
      async (tx) => {
        const updRows = await tx.values<[string, string, string, string | null][]>`
          UPDATE bookings
          SET status = 'cancelled',
              cancelled_by = ${input.actor},
              cancellation_reason = ${input.reason ?? null},
              updated_at = NOW()
          WHERE booking_id = ${input.booking_id}::uuid
          RETURNING booking_id, status, cancelled_by, cancellation_reason
        `;

        const updRow = updRows[0];
        if (updRow === undefined) {
          return [new Error('Failed to update booking status'), null];
        }

        const updatedBooking: UpdatedBooking = {
          booking_id: updRow[0],
          status: updRow[1],
          cancelled_by: updRow[2],
          cancellation_reason: updRow[3],
        };

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
              gcal_client_event_id: booking.gcal_client_event_id,
            }),
          ],
        );

        return [null, updatedBooking];
      },
    );

    if (txErr !== null || updated === null) {
      return [txErr ?? new Error('Unknown transaction error'), null];
    }

    // 5. Mark GCal events for cleanup
    if (booking.gcal_provider_event_id !== null || booking.gcal_client_event_id !== null) {
      await sql`
        UPDATE bookings
        SET gcal_sync_status = 'pending', gcal_retry_count = 0
        WHERE booking_id = ${input.booking_id}::uuid
      `;
    }

    const result: CancelResult = {
      booking_id: toUUID(updated.booking_id),
      previous_status: booking.status,
      new_status: updated.status,
      cancelled_by: updated.cancelled_by,
      cancellation_reason: updated.cancellation_reason,
    };

    return [null, result];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
