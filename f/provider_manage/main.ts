//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : CRUD for providers, services, schedules, and schedule overrides
 * DB Tables Used  : providers, services, provider_schedules, schedule_overrides
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and entity-specific fields
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import { requireDatabaseUrl } from '../internal/config/index.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema } from './types.ts';
import {
  handleProviderActions,
  handleServiceActions,
  handleScheduleActions,
  handleOverrideActions
} from './services.ts';

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(args: any) : Promise<Result<Readonly<Record<string, unknown>>>> {
const rawInput: unknown = args;
  /*
   * REASONING TRACE
   * ### Mission Decomposition
   * - Validate input with Zod
   * - Establish tenant context based on provider_id
   * - Route to specialized handlers (SRP)
   * - Clean up resources (sql.end)
   *
   * ### SOLID Compliance Check
   * - SRP: Routing, Validation, and Implementation are now separated into specialized handlers.
   * - OCP: Adding new actions only requires a new handler or case, without modifying main orchestration.
   * - DIP: Depends on TxClient and DBClient abstractions.
   * - DRY: Centralized DB client creation and Result type usage.
   * - KISS: Clear, readable handlers replace a 200+ line switch statement.
   *
   * ### Failure Mode Analysis
   * - Invalid UUID for provider_id → rejected by withTenantContext
   * - Missing DATABASE_URL → rejected by requireDatabaseUrl
   * - Malformed input → rejected by InputSchema
   */

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('VALIDATION_ERROR: ' + parsed.error.message), null];
  }

  const input = parsed.data;
  const [dbErr, dbUrl] = requireDatabaseUrl();
  if (dbErr !== null) return [dbErr, null];
  if (dbUrl === null) return [new Error('UNEXPECTED_ERROR: DB URL is null'), null];

  const sql = createDbClient({ url: dbUrl });

  // Admin operations require provider_id for tenant context
  if (input.provider_id === undefined) {
    await sql.end();
    return [new Error('MISSING_FIELDS: provider_id is required for all provider_manage operations'), null];
  }

  try {
    const [txErr, txData] = await withTenantContext(sql, input.provider_id, async (tx) => {
      if (input.action.includes('provider')) return handleProviderActions(tx, input);
      if (input.action.includes('service')) return handleServiceActions(tx, input);
      if (input.action.includes('schedule')) return handleScheduleActions(tx, input);
      if (input.action.includes('override')) return handleOverrideActions(tx, input);
      
      return [new Error(`ROUTING_ERROR: Unknown action group: ${input.action}`), null];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [null, { ok: true, message: 'Operation completed successfully' }];

    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('INTERNAL_ERROR: ' + message), null];
  } finally {
    await sql.end();
  }
}