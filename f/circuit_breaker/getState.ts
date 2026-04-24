import postgres from 'postgres';
import { type CircuitBreakerRow, type CircuitState } from "./types.ts";

export async function getState(tx: postgres.Sql, serviceId: string): Promise<CircuitState | null> {
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
