// ============================================================================
// DB CLIENT — PostgreSQL Connection Abstraction
// ============================================================================
// Implements SOLID-D: Dependency Inversion Principle.
// Scripts depend on this abstraction, not on raw `postgres()` calls.
// Ensures consistent SSL, pooling, and timeout configuration.
// ============================================================================

import postgres from 'postgres';

export interface DBConfig {
  readonly url: string;
  readonly ssl?: 'require' | 'allow' | 'prefer' | 'verify-full' | boolean;
  readonly max?: number;
  readonly idleTimeout?: number;
}

/**
 * Creates a configured PostgreSQL client.
 * Usage:
 *   const sql = createDbClient({ url: process.env['DATABASE_URL']! });
 */
export function createDbClient(config: DBConfig): postgres.Sql {
  const isLocalhost = config.url.includes('localhost') || config.url.includes('127.0.0.1');
  return postgres(config.url, {
    ssl: config.ssl ?? (isLocalhost ? false : 'require'),
    max: config.max ?? 1,
    idle_timeout: config.idleTimeout ?? 20,
  });
}

// valuesRows() was removed — AGENTS.md §1.A.2 prohibits 'as Type' casts.
// Use typed tagged templates instead: tx<Row[]>`SELECT col FROM table`
// postgres.js infers the row type from the generic parameter at the call site.

