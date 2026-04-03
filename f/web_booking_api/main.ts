// ============================================================================
// WEB BOOKING API — Web-compatible booking API (create, cancel, reschedule)
// ============================================================================
// Unified endpoint for web booking operations.
// Validates user permissions, checks availability, handles transactions.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import crypto from 'crypto';

const InputSchema = z.object({
  action: z.enum(['create', 'cancel', 'reschedule']),
  user_id: z.string().uuid(),
  booking_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  cancellation_reason: z.string().max(500).optional(),
  idempotency_key: z.string().min(1).optional(),
});

interface BookingResult {
  readonly booking_id: string;
  readonly status: string;
  readonly message: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, BookingResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (parsed.success === false) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { action, user_id, booking_id, provider_id, service_id, start_time, cancellation_reason } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const userRows = await sql`
      SELECT u.user_id, u.email, p.patient_id
      FROM users u
      LEFT JOIN patients p ON p.patient_id = u.user_id OR p.email = u.email
      WHERE u.user_id = ${user_id}::uuid
      LIMIT 1
    `;

    const userRow = userRows[0];
    if (userRow === undefined) {
      return [new Error('User not found'), null];
    }

    let patientId = userRow['patient_id'] !== null ? String(userRow['patient_id']) : null;

    if (patientId === null && userRow['email'] !== null) {
      const patientRows = await sql`
        SELECT patient_id FROM patients WHERE email = ${String(userRow['email'])} LIMIT 1
      `;
      const pRow = patientRows[0];
      if (pRow !== undefined) {
        patientId = String(pRow['patient_id']);
      }
    }

    if (patientId === null) {
      return [new Error('Patient record not found. Please complete your profile first.'), null];
    }

    if (action === 'create') {
      if (provider_id === undefined || service_id === undefined || start_time === undefined) {
        return [new Error('provider_id, service_id, and start_time are required for create'), null];
      }

      const serviceRows = await sql`
        SELECT duration_minutes FROM services WHERE service_id = ${service_id}::uuid LIMIT 1
      `;
      const sRow = serviceRows[0];
      if (sRow === undefined) {
        return [new Error('Service not found'), null];
      }

      const startTime = new Date(start_time);
      const endTime = new Date(startTime.getTime() + Number(sRow['duration_minutes']) * 60000);

      const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();

      const insertRows = await sql`
        INSERT INTO bookings (
          provider_id, patient_id, service_id, start_time, end_time,
          status, idempotency_key, gcal_sync_status
        ) VALUES (
          ${provider_id}::uuid, ${patientId}::uuid, ${service_id}::uuid,
          ${start_time}, ${endTime.toISOString()},
          'pending', ${idempotencyKey}, 'pending'
        )
        RETURNING booking_id, status
      `;

      const newRow = insertRows[0];
      if (newRow === undefined) {
        return [new Error('Failed to create booking. The slot may already be taken.'), null];
      }

      return [null, {
        booking_id: String(newRow['booking_id']),
        status: String(newRow['status']),
        message: 'Booking created successfully',
      }];
    }

    if (action === 'cancel') {
      if (booking_id === undefined) {
        return [new Error('booking_id is required for cancel'), null];
      }

      const bookingRows = await sql`
        SELECT booking_id, status, patient_id FROM bookings
        WHERE booking_id = ${booking_id}::uuid LIMIT 1
      `;

      const bRow = bookingRows[0];
      if (bRow === undefined) {
        return [new Error('Booking not found'), null];
      }

      if (String(bRow['patient_id']) !== patientId) {
        return [new Error('You can only cancel your own bookings'), null];
      }

      const status = String(bRow['status']);
      if (status !== 'pending' && status !== 'confirmed') {
        return [new Error('Cannot cancel booking with status: ' + status), null];
      }

      const updateRows = await sql`
        UPDATE bookings SET
          status = 'cancelled',
          cancellation_reason = ${cancellation_reason ?? null},
          cancelled_by = 'patient',
          updated_at = NOW()
        WHERE booking_id = ${booking_id}::uuid
        RETURNING booking_id, status
      `;

      const updatedRow = updateRows[0];
      if (updatedRow === undefined) {
        return [new Error('Failed to cancel booking'), null];
      }

      return [null, {
        booking_id: String(updatedRow['booking_id']),
        status: String(updatedRow['status']),
        message: 'Booking cancelled successfully',
      }];
    }

    if (action === 'reschedule') {
      if (booking_id === undefined || start_time === undefined) {
        return [new Error('booking_id and start_time are required for reschedule'), null];
      }

      const bookingRows = await sql`
        SELECT booking_id, status, patient_id, provider_id, service_id FROM bookings
        WHERE booking_id = ${booking_id}::uuid LIMIT 1
      `;

      const bRow = bookingRows[0];
      if (bRow === undefined) {
        return [new Error('Booking not found'), null];
      }

      if (String(bRow['patient_id']) !== patientId) {
        return [new Error('You can only reschedule your own bookings'), null];
      }

      const status = String(bRow['status']);
      if (status !== 'pending' && status !== 'confirmed') {
        return [new Error('Cannot reschedule booking with status: ' + status), null];
      }

      const serviceRows = await sql`
        SELECT duration_minutes FROM services WHERE service_id = ${String(bRow['service_id'])}::uuid LIMIT 1
      `;
      const sRow = serviceRows[0];
      if (sRow === undefined) {
        return [new Error('Service not found'), null];
      }

      const startTime = new Date(start_time);
      const endTime = new Date(startTime.getTime() + Number(sRow['duration_minutes']) * 60000);

      const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();

      const insertRows = await sql`
        INSERT INTO bookings (
          provider_id, patient_id, service_id, start_time, end_time,
          status, idempotency_key, rescheduled_from, gcal_sync_status
        ) VALUES (
          ${String(bRow['provider_id'])}::uuid, ${patientId}::uuid, ${String(bRow['service_id'])}::uuid,
          ${start_time}, ${endTime.toISOString()},
          'pending', ${idempotencyKey}, ${booking_id}::uuid, 'pending'
        )
        RETURNING booking_id, status
      `;

      const newRow = insertRows[0];
      if (newRow === undefined) {
        return [new Error('Failed to create rescheduled booking. The slot may already be taken.'), null];
      }

      await sql`
        UPDATE bookings SET status = 'rescheduled', updated_at = NOW()
        WHERE booking_id = ${booking_id}::uuid
      `;

      return [null, {
        booking_id: String(newRow['booking_id']),
        status: String(newRow['status']),
        message: 'Booking rescheduled successfully',
      }];
    }

    return [new Error('Unknown action: ' + action), null];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint') || message.includes('conflicting key value violates exclusion constraint')) {
      return [new Error('The selected time slot is already booked. Please choose another time.'), null];
    }
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
