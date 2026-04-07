// ============================================================================
// TENANT CONTEXT — RLS-isolated DB execution wrapper
// ============================================================================
// AGENTS.md §7: All DB operations MUST occur within tenant context.
// Uses SET LOCAL to inject app.current_tenant, ensuring the variable
// self-destructs at transaction end (no cross-tenant leakage).
//
// Usage:
//   const [err, result] = await withTenantContext(sql, tenantId, async (client) => {
//     const rows = await client`SELECT * FROM bookings WHERE ...`;
//     return [null, rows[0] ?? null];
//   });
//   if (err !== null) { /* handle */ }
// ============================================================================

import postgres from 'postgres';

export type Result<T> = [Error | null, T | null];

/**
 * Executes DB logic under the strict context of a Tenant (RLS).
 * Guarantees transactional isolation and strict context cleanup.
 */
export async function withTenantContext<T>(
  client: postgres.Sql,
  tenantId: string,
  operation: (tx: postgres.TransactionSql) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    const result = await client.begin(async (tx) => {
      // RLS Context Injection (SET LOCAL ensures isolation bound to the transaction)
      await tx.unsafe(
        "SELECT set_config('app.current_tenant', $1, true)",
        [tenantId],
      );

      // Execute business logic within the tenant context
      const [err, data] = await operation(tx);

      if (err !== null) {
        // Return error to trigger rollback
        throw err;
      }

      return data;
    });

    return [null, result];
  } catch (error: unknown) {
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
    const rows = await client<{ current_tenant: string | null }[]>`
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
