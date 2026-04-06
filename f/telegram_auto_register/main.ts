// ============================================================================
// TELEGRAM AUTO REGISTER — Auto-register user from Telegram payload
// ============================================================================
// Creates a user record from Telegram webhook payload.
// No password required — authentication is implicit via chat_id.
// Idempotent: returns existing user if chat_id already registered.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import crypto from 'crypto';

const InputSchema = z.object({
  chat_id: z.string().min(1),
  first_name: z.string().min(1).max(200),
  last_name: z.string().max(200).optional(),
});

interface TelegramUserResult {
  readonly user_id: string;
  readonly full_name: string;
  readonly telegram_chat_id: string;
  readonly role: string;
  readonly is_new: boolean;
  readonly profile_complete: boolean;
}

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function main(rawInput: unknown): Promise<[Error | null, TelegramUserResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { chat_id, first_name, last_name } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const fullName = last_name !== undefined && last_name !== ''
    ? `${first_name} ${last_name}`
    : first_name;

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const existingRows = await sql`
      SELECT user_id, full_name, telegram_chat_id, role,
             CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                  THEN true ELSE false END AS profile_complete
      FROM users
      WHERE telegram_chat_id = ${chat_id}
      LIMIT 1
    `;

    const existingRow = existingRows[0];
    if (existingRow !== undefined) {
      return [null, {
        user_id: String(existingRow['user_id']),
        full_name: String(existingRow['full_name']),
        telegram_chat_id: String(existingRow['telegram_chat_id']),
        role: String(existingRow['role']),
        is_new: false,
        profile_complete: Boolean(existingRow['profile_complete']),
      }];
    }

    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = hashPasswordSync(tempPassword);

    const insertRows = await sql`
      INSERT INTO users (
        full_name, telegram_chat_id, role, password_hash,
        is_active, timezone
      ) VALUES (
        ${fullName}, ${chat_id}, 'client', ${passwordHash},
        true, 'America/Santiago'
      )
      RETURNING user_id, full_name, telegram_chat_id, role
    `;

    const newRow = insertRows[0];
    if (newRow === undefined) {
      return [new Error('Failed to create user record'), null];
    }

    return [null, {
      user_id: String(newRow['user_id']),
      full_name: String(newRow['full_name']),
      telegram_chat_id: String(newRow['telegram_chat_id']),
      role: String(newRow['role']),
      is_new: true,
      profile_complete: false,
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
