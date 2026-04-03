// ============================================================================
// WEB PATIENT BOOKINGS — Patient booking history and upcoming appointments
// ============================================================================
// Returns upcoming and past bookings for a patient.
// Supports filtering by status and date range.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  patient_user_id: z.string().uuid(),
  status: z.enum(['all', 'pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

interface BookingInfo {
  readonly booking_id: string;
  readonly provider_name: string;
  readonly provider_specialty: string;
  readonly service_name: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: string;
  readonly cancellation_reason: string | null;
  readonly can_cancel: boolean;
  readonly can_reschedule: boolean;
}

interface BookingsResult {
  readonly upcoming: ReadonlyArray<BookingInfo>;
  readonly past: ReadonlyArray<BookingInfo>;
  readonly total: number;
}

export async function main(rawInput: unknown): Promise<[Error | null, BookingsResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { patient_user_id, status, limit, offset } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
      SELECT p.patient_id FROM patients p
      INNER JOIN users u ON u.user_id = p.patient_id
      WHERE u.user_id = ${patient_user_id}::uuid
      LIMIT 1
    `;

    const userRow = userRows[0];
    let patientId: string;

    if (userRow === undefined) {
      const patientRows = await sql`
        SELECT patient_id FROM patients
        WHERE email = (SELECT email FROM users WHERE user_id = ${patient_user_id}::uuid LIMIT 1)
        LIMIT 1
      `;
      const pRow = patientRows[0];
      if (pRow === undefined) {
        return [new Error('Patient record not found for this user'), null];
      }
      patientId = String(pRow['patient_id']);
    } else {
      patientId = String(userRow['patient_id']);
    }

    const cancellableStatuses = ['pending', 'confirmed'];
    const reschedulableStatuses = ['pending', 'confirmed'];
    const now = new Date().toISOString();

    let query = sql`
      SELECT b.booking_id, b.start_time, b.end_time, b.status,
             b.cancellation_reason,
             p.name AS provider_name, p.specialty AS provider_specialty,
             s.name AS service_name
      FROM bookings b
      INNER JOIN providers p ON b.provider_id = p.provider_id
      INNER JOIN services s ON b.service_id = s.service_id
      WHERE b.patient_id = ${patientId}::uuid
    `;

    if (status !== 'all') {
      query = sql`${query} AND b.status = ${status}`;
    }

    query = sql`${query} ORDER BY b.start_time DESC LIMIT ${limit} OFFSET ${offset}`;

    const bookingRows = await query;

    const upcoming: BookingInfo[] = [];
    const past: BookingInfo[] = [];

    for (let i = 0; i < bookingRows.length; i++) {
      const row = bookingRows[i];
      if (row === undefined) continue;
      const booking: BookingInfo = {
        booking_id: String(row['booking_id']),
        provider_name: String(row['provider_name']),
        provider_specialty: String(row['provider_specialty']),
        service_name: String(row['service_name']),
        start_time: String(row['start_time']),
        end_time: String(row['end_time']),
        status: String(row['status']),
        cancellation_reason: row['cancellation_reason'] !== null ? String(row['cancellation_reason']) : null,
        can_cancel: cancellableStatuses.includes(String(row['status'])),
        can_reschedule: reschedulableStatuses.includes(String(row['status'])),
      };

      if (String(row['start_time']) > now) {
        upcoming.push(booking);
      } else {
        past.push(booking);
      }
    }

    const countRows = await sql`
      SELECT COUNT(*) AS total FROM bookings
      WHERE patient_id = ${patientId}::uuid
    `;

    const total = countRows[0] !== undefined ? Number(countRows[0]['total']) : 0;

    return [null, {
      upcoming: upcoming,
      past: past,
      total: total,
    }];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
