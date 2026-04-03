// ============================================================================
// WEB PATIENT PROFILE — Patient profile CRUD
// ============================================================================
// Get or update patient profile data.
// Links user to patient record if not already linked.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(['get', 'update']).default('get'),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().optional(),
});

interface ProfileResult {
  readonly patient_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly gcal_calendar_id: string | null;
}

export async function main(rawInput: unknown): Promise<[Error | null, ProfileResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
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
    let patientRows = await sql`
      SELECT patient_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      FROM patients
      WHERE patient_id = ${user_id}::uuid OR email = ${userEmail}
      LIMIT 1
    `;

    let patientRow = patientRows[0];

    if (patientRow === undefined) {
      const createRows = await sql`
        INSERT INTO patients (name, email, phone, telegram_chat_id, timezone)
        VALUES (
          ${String(userRow['full_name'])},
          ${userEmail !== 'null' ? userEmail : null},
          ${userRow['phone'] !== null ? String(userRow['phone']) : null},
          ${userRow['telegram_chat_id'] !== null ? String(userRow['telegram_chat_id']) : null},
          ${String(userRow['timezone'])}
        )
        RETURNING patient_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      `;
      patientRow = createRows[0];
    }

    if (patientRow === undefined) {
      return [new Error('Failed to get or create patient record'), null];
    }

    if (action === 'update') {
      const updates: string[] = [];
      const values: string[] = [];

      if (parsed.data.name !== undefined) {
        updates.push('name = $' + (values.length + 1));
        values.push(parsed.data.name);
      }
      if (parsed.data.email !== undefined) {
        updates.push('email = $' + (values.length + 1));
        values.push(parsed.data.email);
      }
      if (parsed.data.phone !== undefined) {
        updates.push('phone = $' + (values.length + 1));
        values.push(parsed.data.phone);
      }
      if (parsed.data.timezone !== undefined) {
        updates.push('timezone = $' + (values.length + 1));
        values.push(parsed.data.timezone);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        const patientId = String(patientRow['patient_id']);
        const queryText = 'UPDATE patients SET ' + updates.join(', ') + ' WHERE patient_id = $' + (values.length + 1) + '::uuid RETURNING patient_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id';
        values.push(patientId);

        const updateResult = await sql.unsafe(queryText, values);
        const updatedRow = updateResult[0];
        if (updatedRow !== undefined) {
          patientRow = updatedRow;
        }
      }
    }

    return [null, {
      patient_id: String(patientRow['patient_id']),
      name: String(patientRow['name']),
      email: patientRow['email'] !== null ? String(patientRow['email']) : null,
      phone: patientRow['phone'] !== null ? String(patientRow['phone']) : null,
      telegram_chat_id: patientRow['telegram_chat_id'] !== null ? String(patientRow['telegram_chat_id']) : null,
      timezone: String(patientRow['timezone']),
      gcal_calendar_id: patientRow['gcal_calendar_id'] !== null ? String(patientRow['gcal_calendar_id']) : null,
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
