/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Get current user profile + role by user_id
 * DB Tables Used  : users
 * Concurrency Risk: NO — read-only single-row SELECT
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates user_id
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate user_id from input via Zod schema
 * - Query users table for full profile including computed profile_complete flag
 * - Return structured profile or error if user not found/disabled
 *
 * ### Schema Verification
 * - Tables: users
 * - Columns: user_id, email, full_name, role, rut, phone, address, telegram_chat_id, timezone, is_active, last_login, password_hash (for profile_complete computation)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: User not found → return "User not found" error
 * - Scenario 2: Account disabled → return "disabled" error after row lookup
 * - Scenario 3: DB connection failure → caught by outer try/catch, returned as Internal error
 *
 * ### Concurrency Analysis
 * - Risk: NO — read-only single-row SELECT, no mutation
 *
 * ### SOLID Compliance Check
 * - SRP: YES — single responsibility: fetch user profile by ID
 * - DRY: YES — tenant extraction logic shared pattern, Zod schema single source
 * - KISS: YES — direct SELECT → map → return with no intermediate layers
 *
 * → CLEARED FOR CODE GENERATION
 */

// ===
// WEB AUTH ME — Get current user profile + role
// ============================================================================
// Returns full user profile by user_id.
// Used to validate session and load dashboard data.
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  user_id: z.uuid(),
});

interface UserProfileResult {
  readonly user_id: string;
  readonly email: string | null;
  readonly full_name: string;
  readonly role: string;
  readonly rut: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly is_active: boolean;
  readonly profile_complete: boolean;
  readonly last_login: string | null;
}

export async function main(rawInput: unknown): Promise<[Error | null, UserProfileResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { user_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  // user_id IS the tenant context — no key scanning needed
  try {
    const [txErr, txData] = await withTenantContext(sql, user_id, async (tx) => {
      const userRows = await tx.values<[string, string | null, string, string, string | null, string | null, string | null, string | null, string, boolean, string | null, boolean][]>`
        SELECT user_id, email, full_name, role, rut, phone, address,
               telegram_chat_id, timezone, is_active, last_login,
               CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                    THEN true ELSE false END AS profile_complete
        FROM users
        WHERE user_id = ${user_id}::uuid
        LIMIT 1
      `;

      const userRow = userRows[0];
      if (userRow === undefined) {
        return [new Error('User not found'), null];
      }

      const isActive = userRow[9];
      if (!isActive) {
        return [new Error('Account is disabled. Contact support.'), null];
      }

      const result: UserProfileResult = {
        user_id: userRow[0],
        email: userRow[1],
        full_name: userRow[2],
        role: userRow[3],
        rut: userRow[4],
        phone: userRow[5],
        address: userRow[6],
        telegram_chat_id: userRow[7],
        timezone: userRow[8],
        is_active: userRow[9],
        profile_complete: userRow[11],
        last_login: userRow[10],
      };

      return [null, result];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('User not found'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
