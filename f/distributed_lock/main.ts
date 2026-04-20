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

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result/index';
import { withTenantContext } from '../internal/tenant-context/index';
import { executeLockAction } from "./executeLockAction";
import { type Input, InputSchema, type LockResult } from "./types";

// ─── Types & Schemas ────────────────────────────────────────────────────────
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
// ─── Specialized Handlers ───────────────────────────────────────────────────
// ─── Data Access Helpers ───────────────────────────────────────────────────
