import type { TxClient } from '../internal/tenant-context/index.ts';
import type { Result } from '../internal/result/index.ts';
import type { InputParams, BookingInfo, BookingsResult, RawBookingRow } from './types.ts';

// --- Domain Constants ---

const CANCELLABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];
const RESCHEDULABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];

// --- Data Access Functions ---

/**
 * Resolves a client_id from a user_id, with a fallback to email match
 * if the direct user_id link is missing.
 */
async function resolveClientId(tx: TxClient, userId: string): Promise<Result<string>> {
  try {
    const userRows = await tx.values<[string, string, string, string, boolean][]>`
      SELECT p.client_id FROM clients p
      INNER JOIN users u ON u.user_id = p.client_id
      WHERE u.user_id = ${userId}::uuid
      LIMIT 1
    `;

    const firstRow = userRows[0];
    if (firstRow !== undefined) {
      return [null, firstRow[0]];
    }

    // Fallback: search by email match
    const clientRows = await tx.values<[string][]>`
      SELECT client_id FROM clients
      WHERE email = (SELECT email FROM users WHERE user_id = ${userId}::uuid LIMIT 1)
      LIMIT 1
    `;

    const fallbackRow = clientRows[0];
    if (fallbackRow === undefined) {
      return [new Error(`client_identity_not_found: userId=${userId}`), null];
    }

    return [null, fallbackRow[0]];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`identity_resolution_failed: ${msg}`), null];
  }
}

/**
 * Fetches raw booking data and total count for a client.
 */
async function fetchBookingsData(
  tx: TxClient,
  clientId: string,
  input: InputParams
): Promise<Result<{ rows: readonly RawBookingRow[], total: number }>> {
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

// --- Service Layer ---

export class PatientBookingService {
  constructor(private readonly tx: TxClient) {}

  async getBookings(input: InputParams): Promise<Result<BookingsResult>> {
    // 1. Resolve Identity
    const [idErr, clientId] = await resolveClientId(this.tx, input.client_user_id);
    if (idErr !== null || clientId === null) return [idErr, null];

    // 2. Fetch Raw Data
    const [dataErr, data] = await fetchBookingsData(this.tx, clientId, input);
    if (dataErr !== null || data === null) return [dataErr, null];

    // 3. Map to Domain Model
    const now = new Date().toISOString();
    const mapped: BookingInfo[] = data.rows.map((row) => {
      const status = row[3] ? row[3] : 'pendiente';
      return {
        booking_id: row[0],
        start_time: row[1],
        end_time: row[2],
        status: status,
        cancellation_reason: row[4] ?? null,
        provider_name: row[5] ?? null,
        provider_specialty: row[6] ? row[6] : 'General',
        service_name: row[7] ? row[7] : 'Consulta',
        can_cancel: CANCELLABLE_STATUSES.includes(status),
        can_reschedule: RESCHEDULABLE_STATUSES.includes(status),
      };
    });

    // 4. Split and Return
    return [null, {
      upcoming: Object.freeze(mapped.filter((b) => b.start_time > now)),
      past: Object.freeze(mapped.filter((b) => b.start_time <= now)),
      total: data.total
    }];
  }
}
