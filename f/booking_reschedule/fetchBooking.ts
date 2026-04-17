import type { BookingRow } from '../internal/db-types';
import type { Result } from '../internal/result';
import { type Sql } from "./types";

export async function fetchBooking(sql: Sql, id: string): Promise<Result<BookingRow>> {
    try {
    // We select only needed columns but type it against BookingRow for safety
    const rows = await sql<BookingRow[]>`
      SELECT booking_id, status, client_id, provider_id, service_id, start_time, idempotency_key
      FROM bookings
      WHERE booking_id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return [new Error(`Booking ${id} not found`), null];
    return [null, row];
    } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
    }
}
