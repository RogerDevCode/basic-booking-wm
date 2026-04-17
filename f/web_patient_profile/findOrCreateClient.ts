import postgres from 'postgres';
import type { Result } from '../internal/result';
import { type TxClient } from '../internal/tenant-context';

/**
 * Ensures a client record exists, either by finding it or creating from user data.
 */
export async function findOrCreateClient(tx: TxClient, userId: string, user: postgres.Row): Promise<Result<postgres.Row>> {
    try {
    const userEmail = String(user['email']);
    const clientRows = await tx`
      SELECT client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      FROM clients
      WHERE client_id = ${userId}::uuid OR email = ${userEmail}
      LIMIT 1
    `;

    if (clientRows[0]) {
      return [null, clientRows[0]];
    }

    // Auto-create client from user profile
    const createRows = await tx`
      INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
      VALUES (
        ${String(user['full_name'])},
        ${userEmail !== 'null' ? userEmail : null},
        ${user['phone'] !== null ? String(user['phone']) : null},
        ${user['telegram_chat_id'] !== null ? String(user['telegram_chat_id']) : null},
        ${String(user['timezone'])}
      )
      RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
    `;

    if (!createRows[0]) {
      return [new Error('Failed to create client record'), null];
    }

    return [null, createRows[0]];
    } catch (err) {
    return [new Error(`DB_WRITE_ERROR (clients): ${String(err)}`), null];
    }
}
