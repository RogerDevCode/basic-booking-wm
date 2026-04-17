import postgres from 'postgres';
import type { Result } from '../internal/result';
import { type Input, type LockRow } from "./types";

export async function tryInsertLock(tx: postgres.Sql, input: Input, expiresAt: Date): Promise<Result<LockRow>> {
    try {
    const rows = await tx<LockRow[]>`
      INSERT INTO booking_locks (
        lock_key, 
        owner_token, 
        provider_id, 
        start_time, 
        expires_at
      )
      VALUES (
        ${input.lock_key}, 
        ${input.owner_token!}, 
        ${input.provider_id}::uuid, 
        ${input.start_time!}::timestamptz, 
        ${expiresAt.toISOString()}::timestamptz
      )
      ON CONFLICT (lock_key) DO NOTHING
      RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
    `;
    return [null, rows[0] || null];
    } catch (error: unknown) {
    return [new Error(`insert_failed: ${String(error)}`), null];
    }
}
