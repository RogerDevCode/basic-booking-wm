//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Authenticate email+password, return session + role
 * DB Tables Used  : users
 * Concurrency Risk: NO — single-row SELECT + UPDATE last_login
 * GCal Calls      : NO
 * Idempotency Key : N/A — login attempts are naturally non-idempotent
 * RLS Tenant ID   : YES — withAdminContext (app.admin_override) bypasses RLS for user discovery
 * Zod Schemas     : YES — InputSchema validates email and password format
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate raw input against InputSchema (Zod).
 * - Initialize DB client using Dependency Inversion (createDbClient).
 * - Execute login transaction using withAdminContext to bypass RLS for discovery.
 * - Perform password verification using scrypt + salt (SSOT with registration logic).
 * - Update last_login timestamp on successful authentication.
 * - Return structured Result<LoginResult>.
 *
 * ### Schema Verification
 * - Tables: users
 * - Columns: user_id, email, full_name, role, password_hash, is_active, last_login, rut (verified against migration 014).
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Validation failure → [Error, null] immediate return.
 * - Scenario 2: User not found → [Error('Invalid email or password'), null] (security: generic message).
 * - Scenario 3: Password mismatch → [Error('Invalid email or password'), null].
 * - Scenario 4: Account disabled → [Error('Account is disabled. Contact support.'), null].
 * - Scenario 5: Database failure → [Error('transaction_failed'), null].
 *
 * ### Concurrency Analysis
 * - Risk: NO. single row lookup + single row update.
 * - Lock Strategy: Standard row-level locking via transaction.
 *
 * ### SOLID Compliance Check
 * - SRP: Concerns split between schema validation, crypto verification, and DB orchestration.
 * - DRY: Result type and DB client factory reused from internal.
 * - KISS: Linear flow: Parse -> Auth -> Update -> Result.
 * - DIP: DB client injected via factory; transaction wrapper used for context.
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB AUTH LOGIN — Authenticate email+password, return session + role
// ============================================================================
// Validates email and password against stored scrypt hash.
// Updates last_login timestamp on success.
// Returns user_id, email, role, full_name for session management.
// ============================================================================

import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { type Input, InputSchema, type LoginResult, type UserRow } from "./types.ts";
import { verifyPasswordSync } from "./verifyPasswordSync.ts";
import { withAdminContext } from "./withAdminContext.ts";

// ============================================================================
// SCHEMAS & INTERFACES
// ============================================================================
// ============================================================================
// HELPERS
// ============================================================================
// ============================================================================
// MAIN EXECUTION
// ============================================================================

export async function main(args: any) : Promise<Result<LoginResult>> {
const rawInput: unknown = args;
  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;

  // 2. Resolve Configuration
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  // 3. Initialize Client
  const sql = createDbClient({ url: dbUrl });

  try {
    // 4. Execute Auth Transaction
    const [authErr, authData] = await withAdminContext(sql, async (tx) => {
      // Lookup user by email
      const userRows = await tx.values<[string, string, string, string, string, boolean, boolean][]>`
        SELECT user_id, email, full_name, role, password_hash, is_active,
               CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                    THEN true ELSE false END AS profile_complete
        FROM users
        WHERE email = ${input.email}
        LIMIT 1
      `;

      const userRow = userRows[0];
      if (userRow === undefined) {
        return [new Error('Invalid email or password'), null];
      }

      const user: UserRow = {
        user_id: userRow[0],
        email: userRow[1],
        full_name: userRow[2],
        role: userRow[3],
        password_hash: userRow[4],
        is_active: userRow[5],
        profile_complete: userRow[6],
      };

      // Check account status
      if (!user.is_active) {
        return [new Error('Account is disabled. Contact support.'), null];
      }

      // Verify password
      if (!user.password_hash || user.password_hash === 'null') {
        return [new Error('Invalid email or password'), null];
      }

      const isValid = verifyPasswordSync(input.password, user.password_hash);
      if (!isValid) {
        return [new Error('Invalid email or password'), null];
      }

      // Success: Update audit timestamp
      await tx`
        UPDATE users SET last_login = NOW()
        WHERE user_id = ${user.user_id}::uuid
      `;

      return [null, {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        profile_complete: user.profile_complete,
      } satisfies LoginResult];
    });

    if (authErr !== null) {
      return [authErr, null];
    }

    if (authData === null) {
      return [new Error('Login failed: Unexpected null response'), null];
    }

    return [null, authData];

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return [new Error('Internal error: ' + message), null];
  } finally {
    // Ensure connection is released
    await sql.end();
  }
}