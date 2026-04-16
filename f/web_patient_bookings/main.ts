/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Client booking history and upcoming appointments
 * DB Tables Used  : bookings, providers, services, clients, users
 * Concurrency Risk: NO — read-only queries filtered by client_id
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates client_id and filters
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Extract Zod validation to InputSchema using mandatory Spanish vocabulary (§5.1).
 * - Define BookingInfo and BookingsResult as Readonly interfaces (Go-style).
 * - Decompose monolithic main into:
 *   - resolveClientId: Handles patient identity resolution with fallback logic.
 *   - fetchBookingsData: Encapsulates SQL query construction and execution.
 *   - PatientBookingService: Orchestrates resolution, fetching, and domain mapping (SRP).
 * - Ensure all components return Result<T> tuples [Error | null, T | null] per §1.A.3.
 * - Maintain main as a clean Windmill-compatible orchestrator.
 *
 * ### Schema Verification
 * - Tables: bookings, clients, users, providers, services.
 * - Columns: bookings (booking_id, client_id, provider_id, service_id, start_time, end_time, status, cancellation_reason).
 * - Verified against §6 and current file logic.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Invalid input -> Zod error returned.
 * - Scenario 2: DB config missing -> Configuration error returned.
 * - Scenario 3: Client identity resolution fails -> [Error, null] returned.
 * - Scenario 4: Query execution panic -> Caught by try/catch and returned as Result error.
 *
 * ### Concurrency Analysis
 * - Risk: NO. This is a read-only historical view for a single patient.
 *
 * ### SOLID Compliance Check
 * - SRP: main (orchestrator), Service (business logic), data functions (data access).
 * - DRY: Centralized status constants and mapping logic.
 * - KISS: Explicit logic flow, no complex generic gymnastics or "clever" hacks.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import type { TxClient } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// --- Domain Constants ---

const CANCELLABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];
const RESCHEDULABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];

// --- Types & Schemas ---

const InputSchema = z.object({
  client_user_id: z.uuid(),
  status: z.enum(['all', 'pendiente', 'confirmada', 'en_servicio', 'completada', 'cancelada', 'no_presentado', 'reagendada']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

type InputParams = Readonly<z.infer<typeof InputSchema>>;

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

// Type for raw SQL values results to avoid 'unknown' indexing issues
type RawBookingRow = [string, string, string, string, string | null, string | null, string, string];

// --- Data Access Functions ---

/**
 * Resolves a client_id from a user_id, with a fallback to email match
 * if the direct user_id link is missing.
 */
async function resolveClientId(tx: TxClient, userId: string): Promise<Result<string>> {
  try {
    const userRows = await tx.values<[string][]>`
      SELECT p.client_id FROM clients p
      INNER JOIN users u ON u.user_id = p.client_id
      WHERE u.user_id = ${userId}::uuid
      LIMIT 1
    `;

    const firstRow = userRows[0];
    if (firstRow !== undefined) {
      return [null, String(firstRow[0])];
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

    return [null, String(fallbackRow[0])];
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
    const total = (firstCountRow !== undefined && firstCountRow[0] !== undefined) 
      ? Number(firstCountRow[0]) 
      : 0;

    return [null, { rows, total }];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`fetch_bookings_failed: ${msg}`), null];
  }
}

// --- Service Layer ---

class PatientBookingService {
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
      const status = row[3] ? String(row[3]) : 'pendiente';
      return {
        booking_id: String(row[0]),
        start_time: String(row[1]),
        end_time: String(row[2]),
        status: status,
        cancellation_reason: row[4] ? String(row[4]) : null,
        provider_name: row[5] ? String(row[5]) : null,
        provider_specialty: row[6] ? String(row[6]) : 'General',
        service_name: row[7] ? String(row[7]) : 'Consulta',
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

// --- Windmill Endpoint ---

/**
 * Main entry point for patient booking history.
 * Decomposes logic into PatientBookingService for SOLID compliance.
 */
export async function main(rawInput: unknown): Promise<Result<BookingsResult>> {
  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const input: InputParams = parsed.data;

  // 2. Initialize Infrastructure
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('configuration_error: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Orchestrate inside Tenant Context
    const [txErr, txData] = await withTenantContext(sql, input.client_user_id, async (tx) => {
      const service = new PatientBookingService(tx);
      return await service.getBookings(input);
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('execution_error: empty result'), null];

    return [null, txData];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`internal_server_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
