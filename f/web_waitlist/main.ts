// ============================================================================
// WEB WAITLIST — Waitlist CRUD (join, leave, list, position)
// ============================================================================
// Manages patient waitlist entries for services.
// Actions: join, leave, list, check_position
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  action: z.enum(['join', 'leave', 'list', 'check_position']),
  user_id: z.string().uuid(),
  patient_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  waitlist_id: z.string().uuid().optional(),
  preferred_date: z.string().optional(),
  preferred_start_time: z.string().optional(),
  preferred_end_time: z.string().optional(),
});

interface WaitlistEntry {
  readonly waitlist_id: string;
  readonly service_id: string;
  readonly preferred_date: string | null;
  readonly preferred_start_time: string | null;
  readonly status: string;
  readonly position: number;
  readonly created_at: string;
}

interface WaitlistResult {
  readonly entries: ReadonlyArray<WaitlistEntry>;
  readonly position: number | null;
  readonly message: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, WaitlistResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { action, user_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
      SELECT u.user_id, p.patient_id FROM users u
      LEFT JOIN patients p ON p.patient_id = u.user_id OR p.email = u.email
      WHERE u.user_id = ${user_id}::uuid LIMIT 1
    `;

    const userRow = userRows[0];
    if (userRow === undefined) {
      return [new Error('User not found'), null];
    }

    let patientId = userRow['patient_id'] !== null ? String(userRow['patient_id']) : null;
    if (patientId === null && parsed.data.patient_id !== undefined) {
      patientId = parsed.data.patient_id;
    }

    if (patientId === null) {
      return [new Error('Patient record not found'), null];
    }

    if (action === 'join') {
      const serviceId = parsed.data.service_id;
      if (serviceId === undefined) {
        return [new Error('service_id is required for join'), null];
      }

      const existingRows = await sql`
        SELECT waitlist_id, status FROM waitlist
        WHERE patient_id = ${patientId}::uuid
          AND service_id = ${serviceId}::uuid
          AND status IN ('waiting', 'notified')
        LIMIT 1
      `;

      const existingRow = existingRows[0];
      if (existingRow !== undefined) {
        return [new Error('Already on waitlist for this service'), null];
      }

      const countRows = await sql`
        SELECT COUNT(*) AS cnt FROM waitlist
        WHERE service_id = ${serviceId}::uuid AND status = 'waiting'
      `;

      const position = countRows[0] !== undefined ? Number(countRows[0]['cnt']) + 1 : 1;

      const insertRows = await sql`
        INSERT INTO waitlist (
          patient_id, service_id, preferred_date,
          preferred_start_time, preferred_end_time,
          status, position
        ) VALUES (
          ${patientId}::uuid, ${serviceId}::uuid,
          ${parsed.data.preferred_date ?? null},
          ${parsed.data.preferred_start_time ?? null},
          ${parsed.data.preferred_end_time ?? null},
          'waiting', ${position}
        )
        RETURNING waitlist_id
      `;

      const newRow = insertRows[0];
      if (newRow === undefined) {
        return [new Error('Failed to join waitlist'), null];
      }

      return [null, {
        entries: [],
        position: position,
        message: 'Joined waitlist at position ' + position,
      }];
    }

    if (action === 'leave') {
      const waitlistId = parsed.data.waitlist_id;
      if (waitlistId === undefined) {
        return [new Error('waitlist_id is required for leave'), null];
      }

      await sql`
        UPDATE waitlist SET status = 'cancelled', updated_at = NOW()
        WHERE waitlist_id = ${waitlistId}::uuid
          AND patient_id = ${patientId}::uuid
          AND status IN ('waiting', 'notified')
      `;

      await sql.unsafe(
        "SELECT recalculate_waitlist_positions(service_id) FROM waitlist WHERE waitlist_id = $1::uuid",
        [waitlistId]
      );

      return [null, { entries: [], position: null, message: 'Left waitlist successfully' }];
    }

    if (action === 'list') {
      const rows = await sql`
        SELECT waitlist_id, service_id, preferred_date,
               preferred_start_time, status, position, created_at
        FROM waitlist
        WHERE patient_id = ${patientId}::uuid
          AND status IN ('waiting', 'notified')
        ORDER BY created_at DESC
      `;

      const entries: WaitlistEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r === undefined) continue;
        entries.push({
          waitlist_id: String(r['waitlist_id']),
          service_id: String(r['service_id']),
          preferred_date: r['preferred_date'] !== null ? String(r['preferred_date']) : null,
          preferred_start_time: r['preferred_start_time'] !== null ? String(r['preferred_start_time']) : null,
          status: String(r['status']),
          position: Number(r['position']),
          created_at: String(r['created_at']),
        });
      }

      return [null, { entries: entries, position: null, message: 'OK' }];
    }

    if (action === 'check_position') {
      const waitlistId = parsed.data.waitlist_id;
      if (waitlistId === undefined) {
        return [new Error('waitlist_id is required for check_position'), null];
      }

      const rows = await sql`
        SELECT position, status FROM waitlist
        WHERE waitlist_id = ${waitlistId}::uuid
          AND patient_id = ${patientId}::uuid
        LIMIT 1
      `;

      const row = rows[0];
      if (row === undefined) {
        return [new Error('Waitlist entry not found'), null];
      }

      return [null, {
        entries: [],
        position: Number(row['position']),
        message: 'Your position: ' + row['position'],
      }];
    }

    return [new Error('Unknown action: ' + action), null];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
