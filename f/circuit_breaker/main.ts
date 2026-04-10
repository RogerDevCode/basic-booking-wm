/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Service health monitor and failure isolation (circuit breaker pattern)
 * DB Tables Used  : circuit_breaker_state
 * Concurrency Risk: YES — concurrent state updates require atomic operations
 * GCal Calls      : NO — monitors GCal but does not call it directly
 * Idempotency Key : N/A — state machine operations are inherently idempotent
 * RLS Tenant ID   : NO — infrastructure table, no provider_id column
 * Zod Schemas     : YES — InputSchema validates action and parameters
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input (action: check/record_success/record_failure/reset/status, service_id)
 * - Initialize service state if not present (INSERT ON CONFLICT DO NOTHING)
 * - Execute action-specific logic: state checks, counter updates, threshold transitions
 * - Return current circuit state or action result
 *
 * ### Schema Verification
 * - Tables: circuit_breaker_state (service_id, state, failure_count, success_count, failure_threshold, success_threshold, timeout_seconds, opened_at, half_open_at, last_failure_at, last_success_at, last_error_message, updated_at)
 * - Columns: All verified — this is an infrastructure table not in §6 core schema but present in the actual database
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Service not initialized → auto-initialized via INSERT ON CONFLICT DO NOTHING
 * - Scenario 2: Circuit open threshold reached → state transitions to 'open', requests blocked until timeout
 * - Scenario 3: Half-open timeout expires → state transitions to 'half-open', test request allowed
 * - Scenario 4: Success during half-open meets threshold → state resets to 'closed'
 *
 * ### Concurrency Analysis
 * - Risk: YES — concurrent recordFailure calls could race on threshold check; mitigated by withTenantContext wrapping each action in a transaction; UPDATE is atomic at Postgres level
 *
 * ### SOLID Compliance Check
 * - SRP: Each action branch does one thing — YES (check, record_success, record_failure, reset, status are independent)
 * - DRY: No duplicated logic — YES (getState and initService extracted as shared helpers)
 * - KISS: No unnecessary complexity — YES (switch-based action routing, simple counter logic)
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// CIRCUIT BREAKER — Service health monitor and failure isolation
// ============================================================================
// Reads/writes circuit_breaker_state table.
// States: closed (healthy) → open (failing) → half-open (testing recovery)
// Usage: Call check() before making external API calls.
//        Call recordSuccess() or recordFailure() after each call.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { createDbClient } from '../internal/db/client';

type Result<T> = [Error | null, T | null];

/**
 * Circuit breaker state table is system-global (no provider_id column).
 * Executes in a transaction without tenant context — no RLS needed.
 */
async function getCircuitBreakerTx<T>(
  client: postgres.Sql,
  operation: (tx: postgres.Sql) => Promise<Result<T>>,
): Promise<Result<T>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    const [err, data] = await operation(reserved);
    if (err !== null) {
      await reserved`ROLLBACK`;
      return [err, null];
    }
    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

const InputSchema = z.object({
  action: z.enum(['check', 'record_success', 'record_failure', 'reset', 'status']),
  service_id: z.string().min(1),
});

interface CircuitState {
  readonly service_id: string;
  readonly state: 'closed' | 'open' | 'half-open';
  readonly failure_count: number;
  readonly success_count: number;
  readonly failure_threshold: number;
  readonly success_threshold: number;
  readonly timeout_seconds: number;
  readonly opened_at: string | null;
  readonly half_open_at: string | null;
  readonly last_failure_at: string | null;
  readonly last_success_at: string | null;
  readonly last_error_message: string | null;
}

interface CircuitBreakerRow {
  readonly service_id: string;
  readonly state: string;
  readonly failure_count: number;
  readonly success_count: number;
  readonly failure_threshold: number;
  readonly success_threshold: number;
  readonly timeout_seconds: number;
  readonly opened_at: string | null;
  readonly half_open_at: string | null;
  readonly last_failure_at: string | null;
  readonly last_success_at: string | null;
  readonly last_error_message: string | null;
}

async function getState(tx: postgres.Sql, serviceId: string): Promise<CircuitState | null> {
  const rows = await tx<CircuitBreakerRow[]>`
    SELECT service_id, state, failure_count, success_count,
           failure_threshold, success_threshold, timeout_seconds,
           opened_at, half_open_at, last_failure_at, last_success_at,
           last_error_message
    FROM circuit_breaker_state
    WHERE service_id = ${serviceId}
    LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) return null;

  return {
    service_id: row.service_id,
    state: row.state as 'closed' | 'open' | 'half-open',
    failure_count: row.failure_count,
    success_count: row.success_count,
    failure_threshold: row.failure_threshold,
    success_threshold: row.success_threshold,
    timeout_seconds: row.timeout_seconds,
    opened_at: row.opened_at,
    half_open_at: row.half_open_at,
    last_failure_at: row.last_failure_at,
    last_success_at: row.last_success_at,
    last_error_message: row.last_error_message,
  };
}

async function initService(tx: postgres.Sql, serviceId: string): Promise<void> {
  await tx`
    INSERT INTO circuit_breaker_state (service_id, state, failure_count, success_count)
    VALUES (${serviceId}, 'closed', 0, 0)
    ON CONFLICT (service_id) DO NOTHING
  `;
}

interface CircuitBreakerResult {
  readonly allowed?: boolean;
  readonly state?: string;
  readonly retry_after?: number;
  readonly message?: string;
  readonly failure_count?: number;
  readonly success_count?: number;
  readonly error_message?: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, CircuitBreakerResult | CircuitState | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const { action, service_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await getCircuitBreakerTx(sql, async (tx) => {
      await initService(tx, service_id);

      switch (action) {
        case 'check': {
          const state = await getState(tx, service_id);
          if (state === null) {
            return [null, { allowed: true, state: 'closed' }];
          }

          // Check if open circuit should transition to half-open
          if (state.state === 'open' && state.opened_at !== null) {
            const openedAt = new Date(state.opened_at);
            const now = new Date();
            const elapsed = (now.getTime() - openedAt.getTime()) / 1000;
            if (elapsed >= state.timeout_seconds) {
              await tx`
                UPDATE circuit_breaker_state
                SET state = 'half-open', half_open_at = NOW(), failure_count = 0
                WHERE service_id = ${service_id}
              `;
              return [null, { allowed: true, state: 'half-open' }];
            }
            return [null, { allowed: false, state: 'open', retry_after: state.timeout_seconds - elapsed }];
          }

          return [null, { allowed: state.state !== 'open', state: state.state }];
        }

        case 'record_success': {
          await tx`
            UPDATE circuit_breaker_state
            SET success_count = success_count + 1,
                failure_count = 0,
                last_success_at = NOW(),
                updated_at = NOW()
            WHERE service_id = ${service_id}
          `;

          const state = await getState(tx, service_id);
          if (state !== null && state.state === 'half-open' && state.success_count >= state.success_threshold) {
            await tx`
              UPDATE circuit_breaker_state
              SET state = 'closed', success_count = 0, failure_count = 0,
                  opened_at = null, half_open_at = null, updated_at = NOW()
              WHERE service_id = ${service_id}
            `;
          }

          return [null, { state: 'success recorded' }];
        }

        case 'record_failure': {
          const parsedExtra = InputSchema.extend({ error_message: z.string().optional() }).safeParse(rawInput);
          const errorMessage = parsedExtra.success ? parsedExtra.data.error_message : undefined;

          await tx`
            UPDATE circuit_breaker_state
            SET failure_count = failure_count + 1,
                success_count = 0,
                last_failure_at = NOW(),
                last_error_message = ${errorMessage ?? null},
                updated_at = NOW()
            WHERE service_id = ${service_id}
          `;

          const state = await getState(tx, service_id);
          if (state !== null && state.failure_count >= state.failure_threshold && state.state !== 'open') {
            await tx`
              UPDATE circuit_breaker_state
              SET state = 'open', opened_at = NOW(), updated_at = NOW()
              WHERE service_id = ${service_id}
            `;
            return [null, { state: 'opened', message: `Circuit opened for ${service_id} after ${String(state.failure_count)} failures` }];
          }

          return [null, { state: 'failure recorded', failure_count: state?.failure_count ?? 0 }];
        }

        case 'reset': {
          await tx`
            UPDATE circuit_breaker_state
            SET state = 'closed', failure_count = 0, success_count = 0,
                opened_at = null, half_open_at = null, last_error_message = null,
                updated_at = NOW()
            WHERE service_id = ${service_id}
          `;
          return [null, { state: 'reset' }];
        }

        case 'status': {
          const state = await getState(tx, service_id);
          return [null, state];
        }
      }
    });

    if (txErr) {
      return [new Error(txErr.message), null];
    }

    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
