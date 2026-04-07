// ============================================================================
// WEB AUTH LOGIN — Authenticate email+password, return session + role
// ============================================================================
// Validates email and password against stored hash.
// Updates last_login timestamp on success.
// Returns user_id, email, role, full_name for session management.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import crypto from 'crypto';

const InputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

interface LoginResult {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: string;
  readonly profile_complete: boolean;
}

interface UserRow {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: string;
  readonly password_hash: string;
  readonly is_active: boolean;
  readonly profile_complete: boolean;
}

function verifyPasswordSync(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const salt = parts[0];
  const storedKey = parts[1];
  if (salt === undefined || storedKey === undefined) return false;
  const key = crypto.scryptSync(password, salt, 64);

  return key.toString('hex') === storedKey;
}

export async function main(rawInput: unknown): Promise<[Error | null, LoginResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { email, password } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  // Extract tenant ID from input (login is pre-auth, so we use a safe fallback)
  const rawObj = typeof rawInput === 'object' && rawInput !== null ? rawInput : {};
  let tenantId = '00000000-0000-0000-0000-000000000000';
  const tenantKeys = ['provider_id', 'user_id', 'admin_user_id', 'client_id', 'client_user_id'] as const;
  for (const key of tenantKeys) {
    const val = (rawObj as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      tenantId = val;
      break;
    }
  }

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const userRows = await tx.values<[string, string, string, string, string, boolean, boolean][]>`
        SELECT user_id, email, full_name, role, password_hash, is_active,
               CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                    THEN true ELSE false END AS profile_complete
        FROM users
        WHERE email = ${email}
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

      if (!user.is_active) {
        return [new Error('Account is disabled. Contact support.'), null];
      }

      if (user.password_hash === '' || user.password_hash === 'null') {
        return [new Error('Invalid email or password'), null];
      }

      const isValid = verifyPasswordSync(password, user.password_hash);
      if (!isValid) {
        return [new Error('Invalid email or password'), null];
      }

      await tx`
        UPDATE users SET last_login = NOW()
        WHERE user_id = ${user.user_id}::uuid
      `;

      const result: LoginResult = {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        profile_complete: user.profile_complete,
      };

      return [null, result];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Login failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
