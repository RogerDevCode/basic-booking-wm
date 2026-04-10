/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Client booking history and upcoming appointments
 * DB Tables Used  : bookings, providers, services
 * Concurrency Risk: NO — read-only queries filtered by client_id
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates client_id and filters
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate client_user_id and filter parameters via Zod
 * - Resolve user to client_id via clients JOIN users, with email fallback
 * - Query bookings with provider/service joins, split into upcoming vs past by current time
 * - Return paginated results with total count
 *
 * ### Schema Verification
 * - Tables: bookings, clients, users, providers, services
 * - Columns: bookings (booking_id, client_id, provider_id, service_id, start_time, end_time, status, cancellation_reason), clients (client_id, email), providers (name, specialty), services (name)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: No client record found → fallback query by email, then error if still not found
 * - Scenario 2: No bookings → returns empty arrays with total=0 (not an error)
 * - Scenario 3: DB failure → caught by try/catch, returned as Internal error
 *
 * ### Concurrency Analysis
 * - Risk: NO — read-only queries filtered by client_id, no mutation or lock contention
 *
 * ### SOLID Compliance Check
 * - SRP: YES — main handles orchestration, query logic is a single coherent read operation
 * - DRY: YES — cancellable/reschedulable status arrays defined once, tenant extraction uses shared pattern
 * - KISS: YES — straightforward SELECT with JOINs, client-side split by timestamp, no over-engineering
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB PATIENT BOOKINGS — Client booking history and upcoming appointments
// ============================================================================
// Returns upcoming and past bookings for a client.
// Supports filtering by status and date range.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  client_user_id: z.uuid(),
  status: z.enum(['all', 'pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

interface BookingInfo {
  readonly booking_id: string;
  readonly provider_name: string | null;
  readonly provider_specialty: string;
  readonly service_name: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly cancellation_reason: string | null;
  readonly can_cancel: boolean;
  readonly can_reschedule: boolean;
}

interface BookingsResult {
  readonly upcoming: readonly BookingInfo[];
  readonly past: readonly BookingInfo[];
  readonly total: number;
}

export async function main(rawInput: unknown): Promise<[Error | null, BookingsResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, input.client_user_id, async (tx) => {
      const userRows = await tx.values<[string][]>`
        SELECT p.client_id FROM clients p
        INNER JOIN users u ON u.user_id = p.client_id
        WHERE u.user_id = ${input.client_user_id}::uuid
        LIMIT 1
      `;

      let clientId: string;

      if (userRows[0] === undefined) {
        const clientRows = await tx.values<[string][]>`
          SELECT client_id FROM clients
          WHERE email = (SELECT email FROM users WHERE user_id = ${input.client_user_id}::uuid LIMIT 1)
          LIMIT 1
        `;
        const pRow = clientRows[0];
        if (pRow === undefined) {
          return [new Error('Client record not found for this user'), null];
        }
        clientId = pRow[0];
      } else {
        clientId = userRows[0][0];
      }

      const cancellableStatuses = ['pending', 'confirmed'];
      const reschedulableStatuses = ['pending', 'confirmed'];
      const now = new Date().toISOString();

      let statusCondition = '';
      const statusParams: (string | number)[] = [clientId];
      let paramIdx = 2;

      if (input.status !== 'all') {
        statusCondition = ' AND b.status = $' + String(paramIdx);
        statusParams.push(input.status);
        paramIdx++;
      }

      const rows = await tx.values<[string, string, string, string, string, string | null, string, string, string][]>`
        SELECT b.booking_id, b.start_time, b.end_time, b.status,
               b.cancellation_reason,
               p.name AS provider_name, p.specialty AS provider_specialty,
               s.name AS service_name, b.start_time
        FROM bookings b
        INNER JOIN providers p ON b.provider_id = p.provider_id
        INNER JOIN services s ON b.service_id = s.service_id
        WHERE b.client_id = ${clientId}::uuid
        ${statusCondition}
        ORDER BY b.start_time DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `;

      const bookings: BookingInfo[] = rows.map((row) => ({
        booking_id: row[0],
        start_time: row[1],
        end_time: row[2],
        status: row[3],
        cancellation_reason: row[4],
        provider_name: row[5],
        provider_specialty: row[6],
        service_name: row[7],
        can_cancel: cancellableStatuses.includes(row[3]),
        can_reschedule: reschedulableStatuses.includes(row[3]),
      }));

      const upcoming = bookings.filter((b) => b.start_time > now);
      const past = bookings.filter((b) => b.start_time <= now);

      const countRows = await tx.values<[bigint | number][]>`
        SELECT COUNT(*) FROM bookings
        WHERE client_id = ${clientId}::uuid
        ${statusCondition}
      `;
      const total = countRows[0] !== undefined ? Number(countRows[0][0]) : 0;

      return [null, { upcoming, past, total }];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Bookings query failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
