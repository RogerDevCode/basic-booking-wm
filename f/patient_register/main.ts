// ============================================================================
// PATIENT REGISTER — Create or update patient records
// ============================================================================
// Creates a new patient or updates existing one by email/phone/telegram_chat_id.
// Idempotent: if patient exists, updates name/timezone instead of creating duplicate.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  telegram_chat_id: z.string().optional(),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
  idempotency_key: z.string().min(1).optional(),
});

interface PatientRow {
  readonly patient_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
}

interface PatientResult {
  readonly patient_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly created: boolean;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: PatientResult | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: "Validation error: " + parsed.error.message };
  }

  const { name, email, phone, telegram_chat_id, timezone } = parsed.data;

  if (email === undefined && phone === undefined && telegram_chat_id === undefined) {
    return { success: false, data: null, error_message: 'At least one of email, phone, or telegram_chat_id is required' };
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Try to find existing patient
    let existingRow: PatientRow | undefined;

    if (email !== undefined) {
      const rows = await sql<PatientRow[]>`
        SELECT patient_id, name, email, phone, telegram_chat_id, timezone
        FROM patients WHERE email = ${email} LIMIT 1
      `;
      existingRow = rows[0];
    }

    if (existingRow === undefined && telegram_chat_id !== undefined) {
      const rows = await sql<PatientRow[]>`
        SELECT patient_id, name, email, phone, telegram_chat_id, timezone
        FROM patients WHERE telegram_chat_id = ${telegram_chat_id} LIMIT 1
      `;
      existingRow = rows[0];
    }

    if (existingRow === undefined && phone !== undefined) {
      const rows = await sql<PatientRow[]>`
        SELECT patient_id, name, email, phone, telegram_chat_id, timezone
        FROM patients WHERE phone = ${phone} LIMIT 1
      `;
      existingRow = rows[0];
    }

    if (existingRow !== undefined) {
      // Update existing patient
      await sql`
        UPDATE patients
        SET name = ${name},
            timezone = ${timezone},
            email = COALESCE(${email ?? null}, email),
            phone = COALESCE(${phone ?? null}, phone),
            telegram_chat_id = COALESCE(${telegram_chat_id ?? null}, telegram_chat_id),
            updated_at = NOW()
        WHERE patient_id = ${existingRow.patient_id}::uuid
      `;

      return {
        success: true,
        data: {
          patient_id: existingRow.patient_id,
          name,
          email: existingRow.email,
          phone: existingRow.phone,
          telegram_chat_id: existingRow.telegram_chat_id,
          timezone,
          created: false,
        },
        error_message: null,
      };
    }

    // Create new patient
    const rows = await sql<PatientRow[]>`
      INSERT INTO patients (name, email, phone, telegram_chat_id, timezone)
      VALUES (${name}, ${email ?? null}, ${phone ?? null}, ${telegram_chat_id ?? null}, ${timezone})
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        telegram_chat_id = COALESCE(EXCLUDED.telegram_chat_id, patients.telegram_chat_id),
        updated_at = NOW()
      RETURNING patient_id, name, email, phone, telegram_chat_id, timezone
    `;

    const newRow = rows[0];
    if (newRow === undefined) {
      return { success: false, data: null, error_message: 'Failed to create patient' };
    }

    return {
      success: true,
      data: {
        patient_id: newRow.patient_id,
        name: newRow.name,
        email: newRow.email,
        phone: newRow.phone,
        telegram_chat_id: newRow.telegram_chat_id,
        timezone: newRow.timezone,
        created: true,
      },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: "Internal error: " + message };
  } finally {
    await sql.end();
  }
}
