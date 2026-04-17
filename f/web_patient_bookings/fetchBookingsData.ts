import type { Result } from '../internal/result';
import type { TxClient } from '../internal/tenant-context';
import { type InputParams, type RawBookingRow } from "./types";

/**
 * Fetches raw booking data and total count for a client.
 */
export async function fetchBookingsData(tx: TxClient, clientId: string, input: InputParams): Promise<Result<{ rows: readonly RawBookingRow[], total: number }>> {
    try {
    const statusFilter = input.status === 'all' 
      ? tx`` 
      : tx`AND b.status = ${input.status}`;

    // Execute queries sequentially to ensure clean type inference
    const rows = await tx.values<RawBookingRow[]>`
      SELECT b.booking_id, b.start_time, b.end_time, b.status,
             b.cancellation_reason,
             p.name AS provider_name, p.specialty AS provider_specialty,
             s.name AS service_name
      FROM bookings b
      INNER JOIN providers p ON b.provider_id = p.provider_id
      INNER JOIN services s ON b.service_id = s.service_id
      WHERE b.client_id = ${clientId}::uuid
      ${statusFilter}
      ORDER BY b.start_time DESC
      LIMIT ${input.limit} OFFSET ${input.offset}
    `;

    const countRows = await tx.values<[string | number | bigint][]>`
      SELECT COUNT(*) FROM bookings b
      WHERE b.client_id = ${clientId}::uuid
      ${statusFilter}
    `;

    const firstCountRow = countRows[0];
    const total = (firstCountRow?.[0] !== undefined) 
      ? Number(firstCountRow[0]) 
      : 0;

    return [null, { rows, total }];
    } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`fetch_bookings_failed: ${msg}`), null];
    }
}
