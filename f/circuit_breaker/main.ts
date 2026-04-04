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

async function getState(sql: postgres.Sql, serviceId: string): Promise<CircuitState | null> {
  const rows = await sql<CircuitBreakerRow[]>`
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

async function initService(sql: postgres.Sql, serviceId: string): Promise<void> {
  await sql`
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

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: CircuitBreakerResult | CircuitState | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const { action, service_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    await initService(sql, service_id);

    switch (action) {
      case 'check': {
        const state = await getState(sql, service_id);
        if (state === null) {
          return { success: true, data: { allowed: true, state: 'closed' }, error_message: null };
        }

        // Check if open circuit should transition to half-open
        if (state.state === 'open' && state.opened_at !== null) {
          const openedAt = new Date(state.opened_at);
          const now = new Date();
          const elapsed = (now.getTime() - openedAt.getTime()) / 1000;
          if (elapsed >= state.timeout_seconds) {
            await sql`
              UPDATE circuit_breaker_state
              SET state = 'half-open', half_open_at = NOW(), failure_count = 0
              WHERE service_id = ${service_id}
            `;
            return { success: true, data: { allowed: true, state: 'half-open' }, error_message: null };
          }
          return { success: true, data: { allowed: false, state: 'open', retry_after: state.timeout_seconds - elapsed }, error_message: null };
        }

        return { success: true, data: { allowed: state.state !== 'open', state: state.state }, error_message: null };
      }

      case 'record_success': {
        await sql`
          UPDATE circuit_breaker_state
          SET success_count = success_count + 1,
              failure_count = 0,
              last_success_at = NOW(),
              updated_at = NOW()
          WHERE service_id = ${service_id}
        `;

        const state = await getState(sql, service_id);
        if (state !== null && state.state === 'half-open' && state.success_count >= state.success_threshold) {
          await sql`
            UPDATE circuit_breaker_state
            SET state = 'closed', success_count = 0, failure_count = 0,
                opened_at = null, half_open_at = null, updated_at = NOW()
            WHERE service_id = ${service_id}
          `;
        }

        return { success: true, data: { state: 'success recorded' }, error_message: null };
      }

      case 'record_failure': {
        const parsedExtra = InputSchema.extend({ error_message: z.string().optional() }).safeParse(rawInput);
        const errorMessage = parsedExtra.success ? parsedExtra.data.error_message : undefined;

        await sql`
          UPDATE circuit_breaker_state
          SET failure_count = failure_count + 1,
              success_count = 0,
              last_failure_at = NOW(),
              last_error_message = ${errorMessage ?? null},
              updated_at = NOW()
          WHERE service_id = ${service_id}
        `;

        const state = await getState(sql, service_id);
        if (state !== null && state.failure_count >= state.failure_threshold && state.state !== 'open') {
          await sql`
            UPDATE circuit_breaker_state
            SET state = 'open', opened_at = NOW(), updated_at = NOW()
            WHERE service_id = ${service_id}
          `;
          return { success: true, data: { state: 'opened', message: `Circuit opened for ${service_id} after ${String(state.failure_count)} failures` }, error_message: null };
        }

        return { success: true, data: { state: 'failure recorded', failure_count: state?.failure_count ?? 0 }, error_message: null };
      }

      case 'reset': {
        await sql`
          UPDATE circuit_breaker_state
          SET state = 'closed', failure_count = 0, success_count = 0,
              opened_at = null, half_open_at = null, last_error_message = null,
              updated_at = NOW()
          WHERE service_id = ${service_id}
        `;
        return { success: true, data: { state: 'reset' }, error_message: null };
      }

      case 'status': {
        const state = await getState(sql, service_id);
        return { success: true, data: state, error_message: null };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${message}` };
  } finally {
    await sql.end();
  }
}
