import { type LockInfo, type LockRow } from "./types";

/**
 * mapRowToLockInfo converts DB row types to public API types.
 * Adheres to DRY by centralizing conversion logic.
 */
export function mapRowToLockInfo(row: LockRow): LockInfo {
    return {
    lock_id: row.lock_id,
    lock_key: row.lock_key,
    owner_token: row.owner_token,
    provider_id: row.provider_id,
    start_time: row.start_time.toISOString(),
    acquired_at: row.acquired_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    };
}
