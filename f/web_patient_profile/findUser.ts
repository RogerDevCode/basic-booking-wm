import postgres from 'postgres';
import type { Result } from '../internal/result/index.ts';
import { type TxClient } from '../internal/tenant-context/index.ts';

/**
 * Fetches user metadata to facilitate client auto-creation.
 */
export async function findUser(tx: TxClient, userId: string): Promise<Result<postgres.Row>> {
    try {
    const rows = await tx`
      SELECT user_id, email, full_name, phone, telegram_chat_id, timezone
      FROM users 
      WHERE user_id = ${userId}::uuid 
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return [new Error('User not found'), null];
    return [null, user];
    } catch (err) {
    return [new Error(`DB_FETCH_ERROR (users): ${String(err)}`), null];
    }
}
