// ============================================================================
// WEB AUTH ME — Get current user profile + role
// ============================================================================
// Returns full user profile by user_id.
// Used to validate session and load dashboard data.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
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

  // Extract tenant ID from input
  const rawObj = typeof rawInput === 'object' && rawInput !== null ? rawInput : {};
  let tenantId = user_id;
  const tenantKeys = ['provider_id', 'admin_user_id', 'client_id', 'client_user_id'] as const;
  for (const key of tenantKeys) {
    const val = (rawObj as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      tenantId = val;
      break;
    }
  }

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
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
