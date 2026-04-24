import postgres from 'postgres';
import type { Result } from '../internal/result/index.ts';
import { type LockResult, type LockRow } from "./types.ts";

/**
 * cleanupLocks removes all expired locks from the table.
 */
export async function cleanupLocks(tx: postgres.Sql): Promise<Result<LockResult>> {
    try {
    const rows = await tx<Pick<LockRow, 'lock_key'>[]>`
      DELETE FROM booking_locks 
      WHERE expires_at < NOW() 
      RETURNING lock_key
    `;

    return [null, { cleaned: rows.length }];
    } catch (error: unknown) {
    return [new Error(`cleanup_execution_failed: ${String(error)}`), null];
    }
}
