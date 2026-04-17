import type { TxClient } from '../internal/tenant-context';
import type { Result } from '../internal/result';
import type { UserProfileResult } from './types';

export async function getUserProfile(tx: TxClient, userId: string): Promise<Result<UserProfileResult>> {
  const userRows = await tx.values<[string, string | null, string, string, string | null, string | null, string | null, string | null, string, boolean, string | null, boolean]>`
    SELECT user_id, email, full_name, role, rut, phone, address,
           telegram_chat_id, timezone, is_active, last_login,
           CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                THEN true ELSE false END AS profile_complete
    FROM users
    WHERE user_id = ${userId}::uuid
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
    user_id: userRow[0] ?? '',
    email: userRow[1] ?? null,
    full_name: userRow[2] ?? '',
    role: userRow[3] ?? '',
    rut: userRow[4] ?? null,
    phone: userRow[5] ?? null,
    address: userRow[6] ?? null,
    telegram_chat_id: userRow[7] ?? null,
    timezone: userRow[8] ?? 'America/Mexico_City',
    is_active: Boolean(userRow[9]),
    profile_complete: Boolean(userRow[11]),
    last_login: userRow[10] ?? null,
  };

  return [null, result];
}