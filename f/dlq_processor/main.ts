//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Dead Letter Queue (DLQ) processor for failed bookings.
 * DB Tables Used  : booking_dlq
 * Concurrency Risk: YES — global transactions for atomic updates.
 * GCal Calls      : NO
 * Idempotency Key : YES — preserved from failed bookings.
 * RLS Tenant ID   : NO — DLQ is a global system table.
 * Zod Schemas     : YES — input/output and row validation.
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * 1. Validate incoming action and parameters using Zod.
 * 2. Execute requested operation (list, retry, resolve, discard, status) within a global transaction.
 * 3. Return results as Result<T> tuples to ensure consistency and error-as-value handling.
 *
 * ### Schema Verification
 * - booking_dlq: dlq_id, booking_id, provider_id, service_id, failure_reason, last_error_message, last_error_stack, original_payload, idempotency_key, status, created_at, updated_at, resolved_at, resolved_by, resolution_notes. Verified against §6.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: DLQ entry already resolved or discarded -> Fail fast with specific error.
 * - Scenario 2: DB connection failure -> Handled by createDbClient and robust transaction wrapper.
 * - Scenario 3: Missing parameters for specific actions -> Enforced by Zod and action-level checks.
 *
 * ### Concurrency Analysis
 * - Risk: YES — Multiple workers may attempt to process the same DLQ entries.
 * - Lock Strategy: FOR UPDATE SKIP LOCKED on batch retries; FOR UPDATE on targeted single-row operations.
 *
 * ### SOLID Compliance Check
 * - S (SRP): Business logic for each action is isolated in dedicated functions.
 * - O (OCP): New actions can be added by implementing a new function and adding to the dispatcher.
 * - L (LSP): All action functions return a standard Result<unknown> contract.
 * - I (ISP): TxClient interface provides only the necessary DB methods.
 * - D (DIP): Actions depend on the TxClient abstraction, not the concrete sql pool.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, DLQResultSchema } from './types.ts';
import { 
  withGlobalTx, 
  listDLQ, 
  retryDLQ, 
  resolveDLQ, 
  discardDLQ, 
  getDLQStatus 
} from './services.ts';

// --- Main Entry Point ---

/**
 * Windmill main entry point.
 * Dispatches actions to specialized functions after rigorous validation.
 */
export async function main(args: any) : Promise<Result<unknown>> {
const rawInput: unknown = args;
  // 1. Input Validation
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const input = parsed.data;

  // 2. Resource Configuration
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl || dbUrl.trim() === '') {
    return [new Error('configuration_error: DATABASE_URL is missing or empty'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Execution via Global Transaction
    const [err, data] = await withGlobalTx(sql, async (tx) => {
      const router: Record<string, () => Promise<Result<unknown>>> = {
        list: () => listDLQ(tx, input.status_filter),
        retry: () => retryDLQ(tx, input.dlq_id),
        resolve: () => {
          if (input.dlq_id === undefined) return Promise.resolve([new Error('resolve_error: dlq_id is required'), null]);
          return resolveDLQ(tx, input.dlq_id, input.resolved_by, input.resolution_notes);
        },
        discard: () => {
          if (input.dlq_id === undefined) return Promise.resolve([new Error('discard_error: dlq_id is required'), null]);
          return discardDLQ(tx, input.dlq_id, input.resolution_notes);
        },
        status: () => getDLQStatus(tx)
      };

      const handler = router[input.action];
      if (!handler) {
        return [new Error(`unknown_action: ${input.action}`), null];
      }
      return handler();
    });

    if (err !== null) {
      return [err, null];
    }

    // 4. Result Shape Validation
    const finalResult = DLQResultSchema.safeParse(data);
    if (!finalResult.success) {
      return [new Error(`unexpected_result_shape: ${finalResult.error.message}`), null];
    }

    return [null, finalResult.data];

  } catch (error: unknown) {
    // Top-level error catch-all
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`internal_error: ${msg}`), null];

  } finally {
    // 5. Cleanup
    await sql.end();
  }
}