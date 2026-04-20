import postgres from 'postgres';
import type { Result } from '../internal/result/index';
import { type Input, type LockResult, type LockRow } from "./types";

/**
 * checkLock returns the status of an active (non-expired) lock.
 */
export async function checkLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>> {
    try {
    const rows = await tx<LockRow[]>`
      SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
      FROM booking_locks
      WHERE lock_key = ${input.lock_key} 
        AND expires_at > NOW()
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return [null, { locked: false }];

    return [null, { 
      locked: true, 
      owner: row.owner_token, 
      expires_at: row.expires_at.toISOString() 
    }];
    } catch (error: unknown) {
    return [new Error(`check_execution_failed: ${String(error)}`), null];
    }
}
