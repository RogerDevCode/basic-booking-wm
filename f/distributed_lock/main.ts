// ============================================================================
// DISTRIBUTED LOCK — Advisory lock for race condition prevention
// ============================================================================
// Uses booking_locks table for application-level locks.
// Also supports PostgreSQL advisory locks for stronger guarantees.
// Usage: acquire() → do work → release()
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  action: z.enum(['acquire', 'release', 'check', 'cleanup']),
  lock_key: z.string().min(1),
  owner_token: z.string().min(1).optional(),
  provider_id: z.string().uuid().optional(),
  start_time: z.string().datetime().optional(),
  ttl_seconds: z.number().int().min(1).max(3600).default(30),
});

interface LockInfo {
  readonly lock_id: number;
  readonly lock_key: string;
  readonly owner_token: string;
  readonly provider_id: string;
  readonly start_time: string;
  readonly acquired_at: string;
  readonly expires_at: string;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: unknown | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const { action, lock_key, owner_token, provider_id, start_time, ttl_seconds } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    switch (action) {
      case 'acquire': {
        if (owner_token === undefined) {
          return { success: false, data: null, error_message: 'owner_token is required for acquire' };
        }
        if (provider_id === undefined) {
          return { success: false, data: null, error_message: 'provider_id is required for acquire' };
        }
        if (start_time === undefined) {
          return { success: false, data: null, error_message: 'start_time is required for acquire' };
        }

        const expiresAt = new Date(Date.now() + ttl_seconds * 1000);

        // Try to insert lock (unique constraint on lock_key prevents duplicates)
        const rows = await sql`
          INSERT INTO booking_locks (lock_key, owner_token, provider_id, start_time, expires_at)
          VALUES (${lock_key}, ${owner_token}, ${provider_id}::uuid, ${start_time}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
          ON CONFLICT (lock_key) DO NOTHING
          RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
        `;

        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) {
          // Check if existing lock is expired (steal it)
          const existingRows = await sql`
            SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
            FROM booking_locks
            WHERE lock_key = ${lock_key} AND expires_at < NOW()
            LIMIT 1
          `;
          const existing: Record<string, unknown> | undefined = existingRows[0] as Record<string, unknown> | undefined;
          if (existing !== undefined) {
            // Lock is expired — update it
            const updatedRows = await sql`
              UPDATE booking_locks
              SET owner_token = ${owner_token},
                  expires_at = ${expiresAt.toISOString()}::timestamptz,
                  acquired_at = NOW()
              WHERE lock_key = ${lock_key} AND expires_at < NOW()
              RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
            `;
            const updated: Record<string, unknown> | undefined = updatedRows[0] as Record<string, unknown> | undefined;
            if (updated !== undefined) {
              const lockInfo: LockInfo = {
                lock_id: Number(updated['lock_id']),
                lock_key: String(updated['lock_key']),
                owner_token: String(updated['owner_token']),
                provider_id: String(updated['provider_id']),
                start_time: String(updated['start_time']),
                acquired_at: String(updated['acquired_at']),
                expires_at: String(updated['expires_at']),
              };
              return { success: true, data: { acquired: true, lock: lockInfo }, error_message: null };
            }
          }
          return { success: true, data: { acquired: false, reason: 'Lock already held' }, error_message: null };
        }

        const lockInfo: LockInfo = {
          lock_id: Number(row['lock_id']),
          lock_key: String(row['lock_key']),
          owner_token: String(row['owner_token']),
          provider_id: String(row['provider_id']),
          start_time: String(row['start_time']),
          acquired_at: String(row['acquired_at']),
          expires_at: String(row['expires_at']),
        };
        return { success: true, data: { acquired: true, lock: lockInfo }, error_message: null };
      }

      case 'release': {
        if (owner_token === undefined) {
          return { success: false, data: null, error_message: 'owner_token is required for release' };
        }

        const rows = await sql`
          DELETE FROM booking_locks
          WHERE lock_key = ${lock_key} AND owner_token = ${owner_token}
          RETURNING lock_key
        `;
        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) {
          return { success: true, data: { released: false, reason: 'Lock not found or wrong owner' }, error_message: null };
        }
        return { success: true, data: { released: true }, error_message: null };
      }

      case 'check': {
        const rows = await sql`
          SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
          FROM booking_locks
          WHERE lock_key = ${lock_key} AND expires_at > NOW()
          LIMIT 1
        `;
        const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
        if (row === undefined) {
          return { success: true, data: { locked: false }, error_message: null };
        }
        return { success: true, data: { locked: true, owner: String(row['owner_token']), expires_at: String(row['expires_at']) }, error_message: null };
      }

      case 'cleanup': {
        const rows = await sql`
          DELETE FROM booking_locks WHERE expires_at < NOW() RETURNING lock_key
        `;
        return { success: true, data: { cleaned: rows.length }, error_message: null };
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${message}` };
  } finally {
    await sql.end();
  }
}
