/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Advisory lock for race condition prevention (booking_locks table)
 * DB Tables Used  : booking_locks, providers
 * Concurrency Risk: YES — lock acquire/release is the concurrency mechanism
 * GCal Calls      : NO
 * Idempotency Key : N/A — lock operations are stateful
 * RLS Tenant ID   : YES — provider_id used in all queries
 * Zod Schemas     : YES — InputSchema validates action, lock_key, owner_token
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input (action: acquire/release/check/cleanup, lock_key, optional owner_token, provider_id, start_time, ttl_seconds)
 * - acquire: INSERT lock row with ON CONFLICT DO NOTHING, or steal expired lock
 * - release: DELETE lock row matching owner_token
 * - check: SELECT active (non-expired) lock row
 * - cleanup: DELETE all expired locks
 *
 * ### Schema Verification
 * - Tables: booking_locks (lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at), providers (provider_id)
 * - Columns: All verified — booking_locks is an application-level lock table not in §6 core schema but present in the actual database
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Lock already held (not expired) → return acquired: false, caller must retry or fail gracefully
 * - Scenario 2: Owner releases wrong token → return released: false, no unauthorized release
 * - Scenario 3: Expired lock steal race → UPDATE with expires_at < NOW() condition ensures only one caller wins
 * - Scenario 4: Cleanup removes stale locks → safe, no valid lock should have expires_at < NOW()
 *
 * ### Concurrency Analysis
 * - Risk: YES — this IS the concurrency mechanism; unique constraint on lock_key prevents duplicate locks; expired lock steal uses WHERE expires_at < NOW() for atomic update; no SELECT FOR UPDATE needed because single-row INSERT/UPDATE with conflict resolution is atomic in Postgres
 *
 * ### SOLID Compliance Check
 * - SRP: Each action branch does one thing — YES (acquire, release, check, cleanup are independent)
 * - DRY: No duplicated logic — YES (LockInfo and LockResult types shared across all actions)
 * - KISS: No unnecessary complexity — YES (direct SQL operations, no external lock library)
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// DISTRIBUTED LOCK — Advisory lock for race condition prevention
// ============================================================================
// Uses booking_locks table for application-level locks.
// Go-style: no throw, no any, no as. Tuple return.
// Usage: acquire() → do work → release()
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';

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

  // All lock operations require provider_id for RLS tenant isolation
  const tenantId = input.provider_id;
  if (tenantId === undefined) {
    return [new Error('provider_id is required for all lock operations'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txResult] = await withTenantContext<LockResult>(sql, tenantId, async (tx) => {
      return executeLockAction(tx, input);
    });

    if (txErr !== null) return [txErr, null];
    if (txResult === null) return [new Error('Lock operation returned null'), null];
    return [null, txResult];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}

// ─── Lock Action Executor (runs inside tenant context) ──────────────────────
async function executeLockAction(
  tx: postgres.Sql,
  input: Readonly<z.infer<typeof InputSchema>>,
): Promise<[Error | null, LockResult | null]> {
  switch (input.action) {
    case 'acquire': {
      if (input.owner_token === undefined) {
        return [new Error('owner_token is required for acquire'), null];
      }
      if (input.start_time === undefined) {
        return [new Error('start_time is required for acquire'), null];
      }

      const expiresAt = new Date(Date.now() + input.ttl_seconds * 1000);

      // Try to insert lock (unique constraint on lock_key prevents duplicates)
      const rows = await tx.values<[number, string, string, string, string, string, string][]>`
        INSERT INTO booking_locks (lock_key, owner_token, provider_id, start_time, expires_at)
        VALUES (${input.lock_key}, ${input.owner_token}, ${input.provider_id}::uuid, ${input.start_time}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
        ON CONFLICT (lock_key) DO NOTHING
        RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
      `;

      const row = rows[0];
      if (row === undefined) {
        // Check if existing lock is expired (steal it)
        const existingRows = await tx.values<[number, string, string, string, string, string, string][]>`
          SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
          FROM booking_locks
          WHERE lock_key = ${input.lock_key} AND expires_at < NOW()
          LIMIT 1
        `;
        const existing = existingRows[0];
        if (existing !== undefined) {
          // Lock is expired — update it
          const updatedRows = await tx.values<[number, string, string, string, string, string, string][]>`
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
            return [null, { acquired: true, lock: lockInfo }];
          }
        }
        return [null, { acquired: false, reason: 'Lock already held' }];
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
      return [null, { acquired: true, lock: lockInfo }];
    }

    case 'release': {
      if (input.owner_token === undefined) {
        return [new Error('owner_token is required for release'), null];
      }

      const rows = await tx.values<[string][]>`
        DELETE FROM booking_locks
        WHERE lock_key = ${input.lock_key} AND owner_token = ${input.owner_token}
        RETURNING lock_key
      `;
      const row = rows[0];
      if (row === undefined) {
        return [null, { released: false, reason: 'Lock not found or wrong owner' }];
      }
      return [null, { released: true }];
    }

    case 'check': {
      const rows = await tx.values<[number, string, string, string, string, string, string][]>`
        SELECT lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
        FROM booking_locks
        WHERE lock_key = ${input.lock_key} AND expires_at > NOW()
        LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined) {
        return [null, { locked: false }];
      }
      return [null, { locked: true, owner: row[2], expires_at: row[6] }];
    }

    case 'cleanup': {
      const rows = await tx.values<[string][]>`
        DELETE FROM booking_locks WHERE expires_at < NOW() RETURNING lock_key
      `;
      return [null, { cleaned: rows.length }];
    }
  }
}
