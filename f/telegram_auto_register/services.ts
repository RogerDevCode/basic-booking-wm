import crypto from 'crypto';
import postgres from 'postgres';
import type { Result } from '../internal/result';
import type { Input, RegisterResult } from './types';

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function registerTelegramUser(
  tx: postgres.Sql,
  input: Input
): Promise<Result<RegisterResult>> {
  const { chat_id, first_name, last_name } = input;
  const fullName = last_name !== undefined && last_name !== ''
    ? `${first_name} ${last_name}`
    : first_name;

  const existingRows = await tx.values<[string, string, string, string, boolean]>`
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
      user_id: String(existingRow[0]),
      is_new: false,
    }];
  }

  const tempPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = hashPasswordSync(tempPassword);

  const insertRows = await tx.values<[string]>`
    INSERT INTO users (
      full_name, telegram_chat_id, role, password_hash,
      is_active, timezone
    ) VALUES (
      ${fullName}, ${chat_id}, 'client', ${passwordHash},
      true
    )
    RETURNING user_id
  `;

  const newRow = insertRows[0];
  if (newRow === undefined) {
    return [new Error('Failed to create user record'), null];
  }

  return [null, {
    user_id: String(newRow[0]),
    is_new: true,
  }];
}