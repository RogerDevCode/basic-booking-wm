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

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result/index';
import type { TxClient } from '../internal/tenant-context/index';
import { withTenantContext } from '../internal/tenant-context/index';
import { fetchBookingsData } from "./fetchBookingsData";
import { resolveClientId } from "./resolveClientId";
import { type BookingInfo, type BookingsResult, type InputParams, InputSchema } from "./types";

// --- Domain Constants ---

const CANCELLABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];
const RESCHEDULABLE_STATUSES: readonly string[] = ['pendiente', 'confirmada'];

// --- Types & Schemas ---
// Type for raw SQL values results to avoid 'unknown' indexing issues
// --- Data Access Functions ---
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
