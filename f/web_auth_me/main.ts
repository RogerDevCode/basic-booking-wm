// ============================================================================
// WEB AUTH ME — Get current user profile + role
// ============================================================================
// Returns full user profile by user_id.
// Used to validate session and load dashboard data.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  user_id: z.string().uuid(),
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
  if (parsed.success === false) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { user_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
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

    const isActive = Boolean(userRow['is_active']);
    if (!isActive) {
      return [new Error('Account is disabled. Contact support.'), null];
    }

    return [null, {
      user_id: String(userRow['user_id']),
      email: userRow['email'] !== null ? String(userRow['email']) : null,
      full_name: String(userRow['full_name']),
      role: String(userRow['role']),
      rut: userRow['rut'] !== null ? String(userRow['rut']) : null,
      phone: userRow['phone'] !== null ? String(userRow['phone']) : null,
      address: userRow['address'] !== null ? String(userRow['address']) : null,
      telegram_chat_id: userRow['telegram_chat_id'] !== null ? String(userRow['telegram_chat_id']) : null,
      timezone: String(userRow['timezone']),
      is_active: isActive,
      profile_complete: Boolean(userRow['profile_complete']),
      last_login: userRow['last_login'] !== null ? String(userRow['last_login']) : null,
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
