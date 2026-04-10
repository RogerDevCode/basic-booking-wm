// ============================================================================
// TENANT CONTEXT — RLS-isolated DB execution wrapper
// ============================================================================
// AGENTS.md §7: All DB operations MUST occur within tenant context.
// Uses SET LOCAL to inject app.current_tenant, ensuring the variable
// self-destructs at transaction end (no cross-tenant leakage).
//
// AGENTS.md §1.A.1: NO `any`. Operation typed with explicit postgres.ReservedSql.
// AGENTS.md §1.A.3: NO throw for control flow. Errors are values.
//   Rollback is triggered via an explicit ROLLBACK query, not throw.
//   reserve() pins all queries to a single physical connection, which is
//   required for transactional correctness with a connection pool.
//
// Usage:
//   const [err, result] = await withTenantContext(sql, tenantId, async (tx) => {
//     const rows = await tx`SELECT * FROM bookings WHERE ...`;
//     return [null, rows[0] ?? null];
//   });
//   if (err !== null) { /* handle */ }
// ============================================================================

import postgres from 'postgres';

import type { Result } from '../result';
export type { Result } from '../result';

/**
 * TxClient is the structural type that all callers must accept.
 * postgres.ReservedSql satisfies this interface because it extends postgres.Sql.
 * This avoids forcing all callers to migrate from TransactionSql to ReservedSql
 * while still eliminating `any` at the withTenantContext boundary.
 *
 * Callers whose helper functions type tx as postgres.TransactionSql should
 * migrate to postgres.Sql for full compliance with §1.A.1.
 */
export type TxClient = postgres.Sql;

/**
 * Executes DB logic under the strict RLS context of a Tenant.
 * Guarantees:
 *   - Transactional isolation (BEGIN / COMMIT / ROLLBACK)
 *   - Single-connection execution via reserve() — no cross-connection splits
 *   - RLS enforcement via SET LOCAL (self-destructs at transaction end)
 *   - No throw for control flow — all error paths return [Error, null]
 *   - Connection is always released in finally, even on network-level panic
 */
export async function withTenantContext<T>(
  client: postgres.Sql,
  tenantId: string,
  operation: (tx: TxClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  /*
   * PRE-FLIGHT CHECKLIST
   * Mission         : Wrap any DB operation in an RLS-isolated transaction
   * DB Tables Used  : None directly — delegates to operation()
   * Concurrency Risk: YES — reserve() pins a single connection, preventing
   *                   pool interleaving between BEGIN and COMMIT
   * GCal Calls      : NO
   * Idempotency Key : N/A — infrastructure layer only
   * RLS Tenant ID   : YES — SET LOCAL injects app.current_tenant
   * Zod Schemas     : YES — tenantId regex-validated before use
   */

  // FAIL FAST: validate tenantId before consuming a pool connection
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(tenantId)) {
    return [new Error(`invalid_tenant_id: "${tenantId}" is not a valid UUID`), null];
  }

  // reserve() pins this transaction to a single physical connection.
  // Without it, a connection pool could split BEGIN / queries / COMMIT
  // across different sockets — which silently breaks transactional guarantees.
  const reserved = await client.reserve();

  try {
    await reserved`BEGIN`;

    // SET LOCAL: tenant context self-destructs when this transaction ends.
    // This is the RLS enforcement boundary — all queries inside operation()
    // will execute with (provider_id = app.current_tenant) enforced by Postgres.
    await reserved.unsafe(
      "SELECT set_config('app.current_tenant', $1, true)",
      [tenantId],
    );

    // Execute the caller's logic. No throw — [Error, null] propagates cleanly.
    // reserved is a postgres.ReservedSql which extends postgres.Sql (TxClient).
    const [err, data] = await operation(reserved);

    if (err !== null) {
      // Business-logic failure: rollback cleanly, return the error as a value.
      await reserved`ROLLBACK`;
      return [err, null];
    }

    await reserved`COMMIT`;
    return [null, data];

  } catch (error: unknown) {
    // Infrastructure-level panic (network drop, protocol error, unexpected throw
    // from a transitive dependency). Attempt rollback. Swallow rollback errors
    // to surface the original cause.
    await reserved`ROLLBACK`.catch(() => {
      // Swallow rollback error — original error takes priority
    });
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];

  } finally {
    // Always release the connection back to the pool — even if both the
    // operation and the ROLLBACK throw. Failing to release leaks the connection.
    reserved.release();
  }
}

/**
 * Reads the current tenant ID from the session context.
 * Returns null if no tenant context is set.
 */
export async function getCurrentTenant(
  client: postgres.Sql,
): Promise<[Error | null, string | null]> {
  try {
    const rows = await client<readonly { current_tenant: string | null }[]>`
      SELECT current_setting('app.current_tenant', true)::uuid AS current_tenant
    `;
    const row = rows[0];
    if (row === undefined) {
      return [new Error('Failed to read current tenant'), null];
    }
    return [null, row.current_tenant];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`tenant_read_failed: ${msg}`), null];
  }
}
