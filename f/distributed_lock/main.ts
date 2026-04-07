// ============================================================================
// DISTRIBUTED LOCK — Advisory lock for race condition prevention
// ============================================================================
// Uses booking_locks table for application-level locks.
// Go-style: no throw, no any, no as. Tuple return.
// Usage: acquire() → do work → release()
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  action: z.enum(['acquire', 'release', 'check', 'cleanup']),
  lock_key: z.string().min(1),
  owner_token: z.string().min(1).optional(),
  provider_id: z.uuid().optional(),
  start_time: z.iso.datetime().optional(),
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

interface LockRow {
  readonly lock_id: number;
  readonly lock_key: string;
  readonly owner_token: string;
  readonly provider_id: string;
  readonly start_time: string;
  readonly acquired_at: string;
  readonly expires_at: string;
}

interface LockResult {
  readonly acquired?: boolean;
  readonly released?: boolean;
  readonly locked?: boolean;
  readonly cleaned?: number;
  readonly lock?: LockInfo;
  readonly reason?: string;
  readonly owner?: string;
  readonly expires_at?: string;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, LockResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    switch (input.action) {
      case 'acquire': {
        if (input.owner_token === undefined) {
          return [new Error('owner_token is required for acquire'), null];
        }
        if (input.provider_id === undefined) {
          return [new Error('provider_id is required for acquire'), null];
        }
        if (input.start_time === undefined) {
          return [new Error('start_time is required for acquire'), null];
        }

        const expiresAt = new Date(Date.now() + input.ttl_seconds * 1000);

        // Try to insert lock (unique constraint on lock_key prevents duplicates)
        const rows = await sql.values<[number, string, string, string, string, string, string][]>`
          INSERT INTO booking_locks (lock_key, owner_token, provider_id, start_time, expires_at)
          VALUES (${input.lock_key}, ${input.owner_token}, ${input.provider_id}::uuid, ${input.start_time}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
          ON CONFLICT (lock_key) DO NOTHING
          RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
        `;

        const row = rows[0];
        if (row === undefined) {
          // Check if existing lock is expired (steal it)
          const existingRows = await sql.values<[number, string, string, string, string, string, string][]>`
            SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
            FROM booking_locks
            WHERE lock_key = ${input.lock_key} AND expires_at < NOW()
            LIMIT 1
          `;
          const existing = existingRows[0];
          if (existing !== undefined) {
            // Lock is expired — update it
            const updatedRows = await sql.values<[number, string, string, string, string, string, string][]>`
              UPDATE booking_locks
              SET owner_token = ${input.owner_token},
                  expires_at = ${expiresAt.toISOString()}::timestamptz,
                  acquired_at = NOW()
              WHERE lock_key = ${input.lock_key} AND expires_at < NOW()
              RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
            `;
            const updated = updatedRows[0];
            if (updated !== undefined) {
              const lockInfo: LockInfo = {
                lock_id: updated[0],
                lock_key: updated[1],
                owner_token: updated[2],
                provider_id: updated[3],
                start_time: updated[4],
                acquired_at: updated[5],
                expires_at: updated[6],
              };
              const result: LockResult = { acquired: true, lock: lockInfo };
              return [null, result];
            }
          }
          const result: LockResult = { acquired: false, reason: 'Lock already held' };
          return [null, result];
        }

        const lockInfo: LockInfo = {
          lock_id: row[0],
          lock_key: row[1],
          owner_token: row[2],
          provider_id: row[3],
          start_time: row[4],
          acquired_at: row[5],
          expires_at: row[6],
        };
        const result: LockResult = { acquired: true, lock: lockInfo };
        return [null, result];
      }

      case 'release': {
        if (input.owner_token === undefined) {
          return [new Error('owner_token is required for release'), null];
        }

        const rows = await sql`
          DELETE FROM booking_locks
          WHERE lock_key = ${input.lock_key} AND owner_token = ${input.owner_token}
          RETURNING lock_key
        `;
        const row = rows[0];
        if (row === undefined) {
          const result: LockResult = { released: false, reason: 'Lock not found or wrong owner' };
          return [null, result];
        }
        const result: LockResult = { released: true };
        return [null, result];
      }

      case 'check': {
        const rows = await sql.values<[number, string, string, string, string, string, string][]>`
          SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
          FROM booking_locks
          WHERE lock_key = ${input.lock_key} AND expires_at > NOW()
          LIMIT 1
        `;
        const row = rows[0];
        if (row === undefined) {
          const result: LockResult = { locked: false };
          return [null, result];
        }
        const result: LockResult = { locked: true, owner: row[2], expires_at: row[6] };
        return [null, result];
      }

      case 'cleanup': {
        const rows = await sql`
          DELETE FROM booking_locks WHERE expires_at < NOW() RETURNING lock_key
        `;
        const result: LockResult = { cleaned: rows.length };
        return [null, result];
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
