// ============================================================================
// WEB AUTH LOGIN — Authenticate email+password, return session + role
// ============================================================================
// Validates email and password against stored hash.
// Updates last_login timestamp on success.
// Returns user_id, email, role, full_name for session management.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import crypto from 'crypto';

const InputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface LoginResult {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: string;
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

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
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

    const isActive = Boolean(userRow['is_active']);
    if (!isActive) {
      return [new Error('Account is disabled. Contact support.'), null];
    }

    const storedHash = String(userRow['password_hash']);
    if (storedHash === '' || storedHash === 'null') {
      return [new Error('Invalid email or password'), null];
    }

    const isValid = verifyPasswordSync(password, storedHash);
    if (!isValid) {
      return [new Error('Invalid email or password'), null];
    }

    await sql`
      UPDATE users SET last_login = NOW()
      WHERE user_id = ${String(userRow['user_id'])}::uuid
    `;

    return [null, {
      user_id: String(userRow['user_id']),
      email: String(userRow['email']),
      full_name: String(userRow['full_name']),
      role: String(userRow['role']),
      profile_complete: Boolean(userRow['profile_complete']),
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
