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
  readonly ssl?: 'require' | 'verify-full' | 'verify-ca' | boolean;
  readonly max?: number;
  readonly idleTimeout?: number;
}

/**
 * Creates a configured PostgreSQL client.
 * Usage:
 *   const sql = createDbClient({ url: process.env['DATABASE_URL']! });
 */
export function createDbClient(config: DBConfig): postgres.Sql {
  return postgres(config.url, {
    ssl: config.ssl ?? 'require',
    max: config.max ?? 1,
    idle_timeout: config.idleTimeout ?? 20,
  });
}
