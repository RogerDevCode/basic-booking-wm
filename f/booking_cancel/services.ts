import postgres from 'postgres';
import { isBookingStatus } from '../internal/db-types/index.ts';
import type { Result } from '../internal/result/index.ts';
import type { CancelBookingInput, BookingLookup } from './types.ts';

// ─── Authorization ──────────────────────────────────────────────────────────
/**
 * Verifies that the actor has permission to cancel the specific booking.
 */
export function authorizeActor(
  input: Readonly<CancelBookingInput>,
  booking: Readonly<BookingLookup>
): Result<true> {
  if (input.actor === 'client' && booking.client_id !== input.actor_id) {
    return [new Error('unauthorized: client_id mismatch'), null];
  }
  if (input.actor === 'provider' && booking.provider_id !== input.actor_id) {
    return [new Error('unauthorized: provider_id mismatch'), null];
  }
  return [null, true];
}

// ─── Data Access ────────────────────────────────────────────────────────────
/**
 * Fetches booking details for validation and authorization.
 */
export async function fetchBooking(
  sql: postgres.Sql,
  bookingId: string
): Promise<Result<BookingLookup>> {
  try {
    const rows = await sql.values<[string, string, string, string, string | null, string | null][]>`
      SELECT booking_id, status, client_id, provider_id,
             gcal_provider_event_id, gcal_client_event_id
      FROM bookings
      WHERE booking_id = ${bookingId}::uuid
      LIMIT 1
    `;
    
    const row = rows[0];
    if (row === undefined) {
      return [new Error(`booking_not_found: ${bookingId}`), null];
    }

    const rawStatus = row[1];
    if (!isBookingStatus(rawStatus)) {
      return [new Error(`invalid_booking_status: ${rawStatus}`), null];
    }

    return [null, {
      booking_id: row[0],
      status: rawStatus,
      client_id: row[2],
      provider_id: row[3],
      gcal_provider_event_id: row[4],
      gcal_client_event_id: row[5],
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
