import postgres from 'postgres';
import type { Result } from '../internal/result/index.ts';
import { type TxClient } from '../internal/tenant-context/index.ts';
import { type Input } from "./types.ts";

/**
 * Performs a dynamic update on the client profile.
 */
export async function updateProfile(tx: TxClient, clientId: string, data: Partial<Omit<Input, 'user_id' | 'action'>>): Promise<Result<postgres.Row>> {
    try {
    const updates: string[] = [];
    const values: string[] = [];

    // Map allowed fields to SQL updates
    const fieldMap: Record<string, keyof typeof data> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      timezone: 'timezone'
    };

    for (const [col, key] of Object.entries(fieldMap)) {
      const val = data[key];
      if (val !== undefined) {
        updates.push(`${col} = $${String(values.length + 1)}`);
        values.push(val);
      }
    }

    if (updates.length === 0) {
      const rows = await tx`SELECT * FROM clients WHERE client_id = ${clientId}::uuid`;
      return [null, rows[0] ?? null];
    }

    updates.push('updated_at = NOW()');
    const queryText = `
      UPDATE clients
      SET ${updates.join(', ')}
      WHERE client_id = $${String(values.length + 1)}::uuid
      RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
    `;
    values.push(clientId);

    const result = await tx.unsafe(queryText, values);
    if (!result[0]) {
      return [new Error('Update failed: client record missing after write'), null];
    }

    return [null, result[0]];
    } catch (err) {
    return [new Error(`DB_UPDATE_ERROR (clients): ${String(err)}`), null];
    }
}
