/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Password management for providers (generate temp, change, verify)
 * DB Tables Used  : providers
 * Concurrency Risk: NO — single-row UPDATE by provider_id
 * GCal Calls      : NO
 * Idempotency Key : N/A — password changes are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Standardize handler signatures to `(tx, input) => Promise<Result<T>>`.
 * - Implement an action registry to decouple routing from `main`.
 * - Replace `tx.values` with named column selections for better readability and maintainability.
 * - Improve SRP by separating input validation, action dispatching, and business logic.
 *
 * ### Schema Verification
 * - Table: providers (provider_id PK, name, email, password_hash, last_password_change)
 * - Columns: password_hash, password_reset_token, password_reset_expires verified in 003/005
 *
 * ### Failure Mode Analysis
 * - Wrong current password → verifyPassword returns false, error returned
 * - Weak new password → validatePasswordPolicy rejects, error returned
 * - Provider not found → SELECT returns empty, error returned
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row UPDATE by provider_id, no locks needed
 *
 * ### SOLID Compliance Check
 * - SRP: orchestration in main, routing in HANDLERS, logic in specialized functions — YES
 * - OCP: Adding new actions requires no change to the main execution flow — YES
 * - LSP: All handlers follow the Result tuple contract — YES
 * - KISS: Explicit routing and clean error propagation — YES
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// AUTH PROVIDER — Password management (admin + provider)
// ============================================================================
// Actions:
//   - admin_generate_temp: Admin generates 4-char readable temp password
//   - provider_change: Provider changes password (must know current or use temp)
//   - provider_verify: Verify provider login credentials
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { InputSchema } from './types';
import type { AuthInput } from './types';
import { dispatchAction } from './services';

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Windmill main function.
 * Handles configuration, resource lifecycle, and top-level error trapping.
 */
export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: AuthInput = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [err, result] = await dispatchAction(sql, input);
    if (err !== null) {
      return [err, null];
    }
    return [null, result];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
