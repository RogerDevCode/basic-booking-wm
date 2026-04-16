/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Waitlist management (join, leave, list, check position)
 * DB Tables Used  : waitlist, clients, users, services
 * Concurrency Risk: YES — handled via SELECT FOR UPDATE on service_id during join
 * GCal Calls      : NO
 * Idempotency Key : N/A — waitlist operations use existing entry checks
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and waitlist fields
 */

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const InputSchema = z.object({
  action: z.enum(['join', 'leave', 'list', 'check_position']),
  user_id: z.uuid(),
  client_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  waitlist_id: z.uuid().optional(),
  preferred_date: z.string().optional(),
  preferred_start_time: z.string().optional(),
  preferred_end_time: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;

interface WaitlistEntry {
  readonly waitlist_id: string;
  readonly service_id: string;
  readonly preferred_date: string | null;
  readonly preferred_start_time: string | null;
  readonly status: string;
  readonly position: number;
  readonly created_at: string;
}

interface WaitlistResult {
  readonly entries: readonly WaitlistEntry[];
  readonly position: number | null;
  readonly message: string;
}

const WaitlistResultSchema = z.object({
  entries: z.array(z.object({
    waitlist_id: z.string(),
    service_id: z.string(),
    preferred_date: z.string().nullable(),
    preferred_start_time: z.string().nullable(),
    status: z.string(),
    position: z.number(),
    created_at: z.string(),
  })),
  position: z.number().nullable(),
  message: z.string(),
});

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Resolves the client_id for the given user_id.
 */
async function resolveClientId(tx: postgres.Sql, userId: string, inputClientId?: string): Promise<Result<string>> {
  const rows = await tx`
    SELECT u.user_id, p.client_id FROM users u
    LEFT JOIN clients p ON p.client_id = u.user_id OR p.email = u.email
    WHERE u.user_id = ${userId}::uuid LIMIT 1
  `;

  const row = rows[0];
  if (row === undefined) {
    return [new Error('user_not_found'), null];
  }

  const clientId = row['client_id'] !== null ? String(row['client_id']) : (inputClientId ?? null);
  if (clientId === null) {
    return [new Error('client_record_not_found'), null];
  }

  return [null, clientId];
}

/**
 * Logic for joining the waitlist.
 * Uses SELECT FOR UPDATE on the service to prevent position calculation races.
 */
async function handleJoin(tx: postgres.Sql, clientId: string, data: Input): Promise<Result<WaitlistResult>> {
  const { service_id: serviceId } = data;
  if (serviceId === undefined) {
    return [new Error('service_id_required'), null];
  }

  // Lock the service row to serialize waitlist joins for this service
  const serviceCheck = await tx`SELECT 1 FROM services WHERE service_id = ${serviceId}::uuid FOR UPDATE`;
  if (serviceCheck.length === 0) {
    return [new Error('service_not_found'), null];
  }

  const existingRows = await tx`
    SELECT waitlist_id FROM waitlist
    WHERE client_id = ${clientId}::uuid
      AND service_id = ${serviceId}::uuid
      AND status IN ('waiting', 'notified')
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return [new Error('already_on_waitlist'), null];
  }

  const countRows = await tx`
    SELECT COUNT(*) AS cnt FROM waitlist
    WHERE service_id = ${serviceId}::uuid AND status = 'waiting'
  `;

  const position = countRows[0] !== undefined ? Number(countRows[0]['cnt']) + 1 : 1;

  const insertRows = await tx`
    INSERT INTO waitlist (
      client_id, service_id, preferred_date,
      preferred_start_time, preferred_end_time,
      status, position
    ) VALUES (
      ${clientId}::uuid, ${serviceId}::uuid,
      ${data.preferred_date ?? null},
      ${data.preferred_start_time ?? null},
      ${data.preferred_end_time ?? null},
      'waiting', ${position}
    )
    RETURNING waitlist_id
  `;

  if (insertRows.length === 0) {
    return [new Error('insert_failed'), null];
  }

  return [null, {
    entries: [],
    position,
    message: `Joined waitlist at position ${position}`,
  }];
}

/**
 * Logic for leaving the waitlist.
 */
async function handleLeave(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>> {
  if (waitlistId === undefined) {
    return [new Error('waitlist_id_required'), null];
  }

  const updateRows = await tx`
    UPDATE waitlist SET status = 'cancelled', updated_at = NOW()
    WHERE waitlist_id = ${waitlistId}::uuid
      AND client_id = ${clientId}::uuid
      AND status IN ('waiting', 'notified')
    RETURNING service_id
  `;

  if (updateRows.length > 0) {
    // Recalculate positions for remaining entries in this service
    await tx.unsafe(
      "SELECT recalculate_waitlist_positions(service_id) FROM waitlist WHERE waitlist_id = $1::uuid",
      [waitlistId]
    );
  }

  return [null, { entries: [], position: null, message: 'Left waitlist successfully' }];
}

/**
 * Lists all active waitlist entries for the client.
 */
async function handleList(tx: postgres.Sql, clientId: string): Promise<Result<WaitlistResult>> {
  const rows = await tx`
    SELECT waitlist_id, service_id, preferred_date,
           preferred_start_time, status, position, created_at
    FROM waitlist
    WHERE client_id = ${clientId}::uuid
      AND status IN ('waiting', 'notified')
    ORDER BY created_at DESC
  `;

  const entries: WaitlistEntry[] = rows.map(r => ({
    waitlist_id: String(r['waitlist_id']),
    service_id: String(r['service_id']),
    preferred_date: r['preferred_date'] !== null ? String(r['preferred_date']) : null,
    preferred_start_time: r['preferred_start_time'] !== null ? String(r['preferred_start_time']) : null,
    status: String(r['status']),
    position: Number(r['position']),
    created_at: String(r['created_at']),
  }));

  return [null, { entries, position: null, message: 'OK' }];
}

/**
 * Checks the current position of a specific waitlist entry.
 */
async function handleCheckPosition(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>> {
  if (waitlistId === undefined) {
    return [new Error('waitlist_id_required'), null];
  }

  const rows = await tx`
    SELECT position FROM waitlist
    WHERE waitlist_id = ${waitlistId}::uuid
      AND client_id = ${clientId}::uuid
    LIMIT 1
  `;

  const row = rows[0];
  if (row === undefined) {
    return [new Error('entry_not_found'), null];
  }

  const position = Number(row['position']);
  return [null, {
    entries: [],
    position,
    message: `Your position: ${position}`,
  }];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Input validation using Zod.
 * - Client resolution based on user_id.
 * - Strategy pattern for action dispatching (join, leave, list, check_position).
 * - Proper transaction and RLS management via withTenantContext.
 *
 * ### Schema Verification
 * - Tables: waitlist, users, clients, services.
 * - Columns: verified against existing usage and §6 where applicable.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Database connection failure -> Caught in outer try/catch.
 * - Scenario 2: Action handler failure -> [Error, null] returned from handler, transaction rolled back.
 * - Scenario 3: Validation failure -> Early return before DB connection.
 *
 * ### Concurrency Analysis
 * - Risk: HIGH on join.
 * - Strategy: SELECT FOR UPDATE on the services table during handleJoin to serialize inserts for the same service.
 *
 * ### SOLID Compliance Check
 * - S: Orchestration in main, logic in action-specific handlers.
 * - O: New actions can be added by implementing a new handler and adding to the switch.
 * - D: tx (postgres.Sql) injected into all handlers.
 */
export async function main(rawInput: unknown): Promise<Result<WaitlistResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('configuration_error: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const { action, user_id, client_id: inputClientId } = parsed.data;
  const tenantId = inputClientId ?? user_id;

  try {
    const [txErr, txData] = await withTenantContext<WaitlistResult>(sql, tenantId, async (tx) => {
      // 1. Resolve Identity
      const [resErr, clientId] = await resolveClientId(tx, user_id, inputClientId);
      if (resErr !== null) return [resErr, null];
      if (clientId === null) return [new Error('unresolved_client'), null];

      // 2. Dispatch Action
      switch (action) {
        case 'join':           return await handleJoin(tx, clientId, parsed.data);
        case 'leave':          return await handleLeave(tx, clientId, parsed.data.waitlist_id);
        case 'list':           return await handleList(tx, clientId);
        case 'check_position': return await handleCheckPosition(tx, clientId, parsed.data.waitlist_id);
        default: {
          const _exhaustive: never = action;
          return [new Error(`unsupported_action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) {
      return [txErr, null];
    }

    // 3. Final Verification
    const result = WaitlistResultSchema.safeParse(txData);
    if (!result.success) {
      return [new Error(`unexpected_result_shape: ${result.error.message}`), null];
    }

    return [null, result.data];

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`internal_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
