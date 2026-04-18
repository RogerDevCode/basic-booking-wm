import postgres from 'postgres';
import type { Result } from '../internal/result';
import { type Input, type LockRow } from "./types";

export async function tryStealExpiredLock(tx: postgres.Sql, input: Input, expiresAt: Date): Promise<Result<LockRow>> {
    if (!input.owner_token) {
      return [new Error('owner_token is required'), null];
    }
    if (!input.start_time) {
      return [new Error('start_time is required'), null];
    }
    try {
    const rows = await tx<LockRow[]>`
      UPDATE booking_locks
      SET owner_token = ${input.owner_token},
          expires_at = ${expiresAt.toISOString()}::timestamptz,
          acquired_at = NOW(),
          start_time = ${input.start_time}::timestamptz
      WHERE lock_key = ${input.lock_key}
        AND expires_at < NOW()
      RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
    `;
    return [null, rows[0] ?? null];
    } catch (error: unknown) {
    return [new Error(`steal_failed: ${String(error)}`), null];
    }
}
