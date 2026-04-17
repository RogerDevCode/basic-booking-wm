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

import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { InputSchema, WaitlistResultSchema } from './types';
import type { WaitlistResult } from './types';
import {
  resolveClientId,
  handleJoin,
  handleLeave,
  handleList,
  handleCheckPosition
} from './services';

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
