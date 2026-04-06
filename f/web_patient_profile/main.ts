// ============================================================================
// WEB PATIENT PROFILE — Client profile CRUD
// ============================================================================
// Get or update client profile data.
// Links user to client record if not already linked.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  user_id: z.uuid(),
  action: z.enum(['get', 'update']).default('get'),
  name: z.string().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().optional(),
});

interface ProfileResult {
  readonly client_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly gcal_calendar_id: string | null;
}

export async function main(rawInput: unknown): Promise<[Error | null, ProfileResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { user_id, action } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
      SELECT user_id, email, full_name, phone, telegram_chat_id, timezone
      FROM users WHERE user_id = ${user_id}::uuid LIMIT 1
    `;

    const userRow = userRows[0];
    if (userRow === undefined) {
      return [new Error('User not found'), null];
    }

    const userEmail = String(userRow['email']);
    const clientRows = await sql`
      SELECT client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      FROM clients
      WHERE client_id = ${user_id}::uuid OR email = ${userEmail}
      LIMIT 1
    `;

    let clientRow = clientRows[0];

    if (clientRow === undefined) {
      const createRows = await sql`
        INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
        VALUES (
          ${String(userRow['full_name'])},
          ${userEmail !== 'null' ? userEmail : null},
          ${userRow['phone'] !== null ? String(userRow['phone']) : null},
          ${userRow['telegram_chat_id'] !== null ? String(userRow['telegram_chat_id']) : null},
          ${String(userRow['timezone'])}
        )
        RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      `;
      clientRow = createRows[0];
    }

    if (clientRow === undefined) {
      return [new Error('Failed to get or create client record'), null];
    }

    if (action === 'update') {
      const updates: string[] = [];
      const values: string[] = [];

      if (parsed.data.name !== undefined) {
        updates.push('name = $' + String(values.length + 1));
        values.push(parsed.data.name);
      }
      if (parsed.data.email !== undefined) {
        updates.push('email = $' + String(values.length + 1));
        values.push(parsed.data.email);
      }
      if (parsed.data.phone !== undefined) {
        updates.push('phone = $' + String(values.length + 1));
        values.push(parsed.data.phone);
      }
      if (parsed.data.timezone !== undefined) {
        updates.push('timezone = $' + String(values.length + 1));
        values.push(parsed.data.timezone);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        const clientId = String(clientRow['client_id']);
        const queryText = 'UPDATE clients SET ' + updates.join(', ') + ' WHERE client_id = $' + String(values.length + 1) + '::uuid RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id';
        values.push(clientId);

        const updateResult = await sql.unsafe(queryText, values);
        const updatedRow = updateResult[0];
        if (updatedRow !== undefined) {
          clientRow = updatedRow;
        }
      }
    }

    return [null, {
      client_id: String(clientRow['client_id']),
      name: String(clientRow['name']),
      email: clientRow['email'] !== null ? String(clientRow['email']) : null,
      phone: clientRow['phone'] !== null ? String(clientRow['phone']) : null,
      telegram_chat_id: clientRow['telegram_chat_id'] !== null ? String(clientRow['telegram_chat_id']) : null,
      timezone: String(clientRow['timezone']),
      gcal_calendar_id: clientRow['gcal_calendar_id'] !== null ? String(clientRow['gcal_calendar_id']) : null,
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
