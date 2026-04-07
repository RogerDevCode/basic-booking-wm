// ============================================================================
// TENANT CONTEXT — RLS-isolated DB execution wrapper
// ============================================================================
// AGENTS.md §7: All DB operations MUST occur within tenant context.
// Uses SET LOCAL to inject app.current_tenant, ensuring the variable
// self-destructs at transaction end (no cross-tenant leakage).
//
// AGENTS.md §1.A.3: NO throw for control flow. Errors are values.
// Rollback is triggered via explicit ROLLBACK, not throw.
//
// Usage:
//   const [err, result] = await withTenantContext(sql, tenantId, async (tx) => {
//     const rows = await tx`SELECT * FROM bookings WHERE ...`;
//     return [null, rows[0] ?? null];
//   });
//   if (err !== null) { /* handle */ }
// ============================================================================

import postgres from 'postgres';

export type Result<T> = [Error | null, T | null];

/**
 * Executes DB logic under the strict context of a Tenant (RLS).
 * Guarantees transactional isolation and strict context cleanup.
 * NO throw — explicit ROLLBACK/COMMIT only.
 */
export async function withTenantContext<T>(
  client: postgres.Sql,
  tenantId: string,
  operation: (tx: postgres.TransactionSql) => Promise<Result<T>>,
): Promise<Result<T>> {
  // FAIL FAST: validate tenantId before opening a transaction
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(tenantId)) {
    return [new Error(`invalid_tenant_id: "${tenantId}" is not a valid UUID`), null];
  }

  const tx = await client.begin();

  try {
    // SET LOCAL: context self-destructs at transaction end (KISS + security)
    await tx.unsafe(
      "SELECT set_config('app.current_tenant', $1, true)",
      [tenantId],
    );

    const [err, data] = await operation(tx);

    if (err !== null) {
      // Explicit ROLLBACK — no throw
      await tx.rollback();
      return [err, null];
    }

    await tx.commit();
    return [null, data];
  } catch (error: unknown) {
    // Catch unexpected errors (network, protocol errors)
    await tx.rollback().catch(() => {
      // Swallow rollback error — original error takes priority
    });
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
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
    const rows = await client<ReadonlyArray<{ current_tenant: string | null }>>`
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
