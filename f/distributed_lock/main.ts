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
 * - SRP: Split executeLockAction into specialized handlers (acquire, release, etc.) — YES
 * - DRY: Centralized row-to-LockInfo mapping — YES
 * - KISS: Simple, direct SQL operations without unnecessary abstractions — YES
 * - OCP: Adding new actions requires a new handler function and switch case entry — YES
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
import type { Result } from '../internal/result';

// ─── Types & Schemas ────────────────────────────────────────────────────────

const InputSchema = z.object({
  action: z.enum(['acquire', 'release', 'check', 'cleanup']),
  lock_key: z.string().min(1),
  owner_token: z.string().min(1).optional(),
  provider_id: z.uuid(), // provider_id is mandatory for RLS context
  start_time: z.string().datetime().optional(),
  ttl_seconds: z.number().int().min(1).max(3600).default(30),
});

type Input = Readonly<z.infer<typeof InputSchema>>;

interface LockInfo {
  readonly lock_id: string;
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

/**
 * DB Row structure for booking_locks table
 */
interface LockRow {
  readonly lock_id: string;
  readonly lock_key: string;
  readonly owner_token: string;
  readonly provider_id: string;
  readonly start_time: Date;
  readonly acquired_at: Date;
  readonly expires_at: Date;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * main serves as the Windmill endpoint for distributed lock operations.
 * Adheres to SRP by handling only entry-level validation and context setup.
 */
export async function main(
  rawInput: unknown,
): Promise<Result<LockResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_failed: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('configuration_failed: DATABASE_URL is missing'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    return await withTenantContext<LockResult>(sql, input.provider_id, async () => {
      return executeLockAction(sql, input);
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`internal_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}

// ─── Action Orchestrator ────────────────────────────────────────────────────

/**
 * executeLockAction routes the request to specialized handlers.
 * Adheres to OCP by allowing easy addition of new action handlers.
 */
async function executeLockAction(
  tx: postgres.Sql,
  input: Input,
): Promise<Result<LockResult>> {
  switch (input.action) {
    case 'acquire':
      return acquireLock(tx, input);
    case 'release':
      return releaseLock(tx, input);
    case 'check':
      return checkLock(tx, input);
    case 'cleanup':
      return cleanupLocks(tx);
    default:
      return [new Error(`unsupported_action: ${input.action}`), null];
  }
}

// ─── Specialized Handlers ───────────────────────────────────────────────────

/**
 * acquireLock attempts to create a new lock or steal an expired one.
 * Uses atomic SQL operations to prevent races.
 */
async function acquireLock(
  tx: postgres.Sql,
  input: Input,
): Promise<Result<LockResult>> {
  if (!input.owner_token || !input.start_time) {
    return [new Error('acquire_failed: owner_token and start_time are required'), null];
  }

  const expiresAt = new Date(Date.now() + input.ttl_seconds * 1000);

  // Attempt 1: Insert new lock row
  const [insertErr, inserted] = await tryInsertLock(tx, input, expiresAt);
  if (insertErr) return [insertErr, null];
  if (inserted) return [null, { acquired: true, lock: mapRowToLockInfo(inserted) }];

  // Attempt 2: Steal expired lock
  const [stealErr, stolen] = await tryStealExpiredLock(tx, input, expiresAt);
  if (stealErr) return [stealErr, null];
  if (stolen) return [null, { acquired: true, lock: mapRowToLockInfo(stolen) }];

  return [null, { acquired: false, reason: 'lock_already_held' }];
}

/**
 * releaseLock removes a lock matching the key and owner token.
 */
async function releaseLock(
  tx: postgres.Sql,
  input: Input,
): Promise<Result<LockResult>> {
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

/**
 * checkLock returns the status of an active (non-expired) lock.
 */
async function checkLock(
  tx: postgres.Sql,
  input: Input,
): Promise<Result<LockResult>> {
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

/**
 * cleanupLocks removes all expired locks from the table.
 */
async function cleanupLocks(
  tx: postgres.Sql,
): Promise<Result<LockResult>> {
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

// ─── Data Access Helpers ───────────────────────────────────────────────────

async function tryInsertLock(
  tx: postgres.Sql,
  input: Input,
  expiresAt: Date,
): Promise<Result<LockRow>> {
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

async function tryStealExpiredLock(
  tx: postgres.Sql,
  input: Input,
  expiresAt: Date,
): Promise<Result<LockRow>> {
  try {
    const rows = await tx<LockRow[]>`
      UPDATE booking_locks
      SET owner_token = ${input.owner_token!},
          expires_at = ${expiresAt.toISOString()}::timestamptz,
          acquired_at = NOW(),
          start_time = ${input.start_time!}::timestamptz
      WHERE lock_key = ${input.lock_key} 
        AND expires_at < NOW()
      RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
    `;
    return [null, rows[0] || null];
  } catch (error: unknown) {
    return [new Error(`steal_failed: ${String(error)}`), null];
  }
}

/**
 * mapRowToLockInfo converts DB row types to public API types.
 * Adheres to DRY by centralizing conversion logic.
 */
function mapRowToLockInfo(row: LockRow): LockInfo {
  return {
    lock_id: String(row.lock_id),
    lock_key: row.lock_key,
    owner_token: row.owner_token,
    provider_id: row.provider_id,
    start_time: row.start_time.toISOString(),
    acquired_at: row.acquired_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}
