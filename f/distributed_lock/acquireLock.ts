import postgres from 'postgres';
import type { Result } from '../internal/result';
import { mapRowToLockInfo } from "./mapRowToLockInfo";
import { tryInsertLock } from "./tryInsertLock";
import { tryStealExpiredLock } from "./tryStealExpiredLock";
import { type Input, type LockResult } from "./types";

/**
 * acquireLock attempts to create a new lock or steal an expired one.
 * Uses atomic SQL operations to prevent races.
 */
export async function acquireLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>> {
    if (!input.owner_token || !input.start_time) {
    return [new Error('acquire_failed: owner_token and start_time are required'), null];
    }

    const expiresAt = new Date(Date.now() + input.ttl_seconds * 1000);
    const [insertErr, inserted] = await tryInsertLock(tx, input, expiresAt);
    if (insertErr) return [insertErr, null];
    if (inserted) return [null, { acquired: true, lock: mapRowToLockInfo(inserted) }];
    const [stealErr, stolen] = await tryStealExpiredLock(tx, input, expiresAt);
    if (stealErr) return [stealErr, null];
    if (stolen) return [null, { acquired: true, lock: mapRowToLockInfo(stolen) }];
    return [null, { acquired: false, reason: 'lock_already_held' }];
}
