import postgres from 'postgres';
import type { Result } from '../internal/result';
import { type Input, type LockResult, type LockRow } from "./types";

/**
 * releaseLock removes a lock matching the key and owner token.
 */
export async function releaseLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>> {
    if (!input.owner_token) {
    return [new Error('release_failed: owner_token is required'), null];
    }

    try {
    const rows = await tx<Pick<LockRow, 'lock_key'>[]>`
      DELETE FROM booking_locks
      WHERE lock_key = ${input.lock_key} 
        AND owner_token = ${input.owner_token}
      RETURNING lock_key
    `;

    if (rows.length === 0) {
      return [null, { released: false, reason: 'lock_not_found_or_unauthorized' }];
    }

    return [null, { released: true }];
    } catch (error: unknown) {
    return [new Error(`release_execution_failed: ${String(error)}`), null];
    }
}
