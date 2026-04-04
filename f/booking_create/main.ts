// ============================================================================
// BOOKING CREATE — Create a new medical appointment
// ============================================================================
// Go-style: no throw for control flow, no any, no as.
// All errors returned as Error values. All DB operations use typed interfaces.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import type { UUID } from '../internal/db-types';
import { toUUID } from '../internal/db-types';

interface CreatedBookingRow {
  booking_id: string;
  status: string;
  start_time: string;
  end_time: string;
  idempotent: boolean;
}

// ─── Input Validation ───────────────────────────────────────────────────────
const InputSchema = z.object({
  patient_id: z.uuid(),
  provider_id: z.uuid(),
  service_id: z.uuid(),
  start_time: z.coerce.date(),
  idempotency_key: z.string().min(1),
  notes: z.string().optional(),
  actor: z.enum(['patient', 'provider', 'system']).default('patient'),
  channel: z.enum(['telegram', 'web', 'api']).default('api'),
});

type CreateBookingInput = z.infer<typeof InputSchema>;

// ─── Output Types ───────────────────────────────────────────────────────────
export interface BookingCreated {
  readonly booking_id: UUID;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly provider_name: string;
  readonly service_name: string;
  readonly patient_name: string;
}

// ─── Typed Row Interfaces ───────────────────────────────────────────────────
interface PatientLookup {
  readonly patient_id: string;
  readonly name: string;
}

interface ProviderLookup {
  readonly provider_id: string;
  readonly name: string;
  readonly timezone: string;
}

interface ServiceLookup {
  readonly service_id: string;
  readonly name: string;
  readonly duration_minutes: number;
}

interface OverlapCheck {
  readonly booking_id: string;
}

interface InsertedBooking {
  readonly booking_id: string;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
}

// ─── Validation Functions (return [Error | null, Result | null]) ────────────
async function lookupPatient(
  sql: postgres.Sql,
  patientId: string,
): Promise<[Error | null, PatientLookup | null]> {
  const rows = await sql<PatientLookup[]>`
    SELECT patient_id, name FROM patients WHERE patient_id = ${patientId}::uuid LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return [new Error(`Patient ${patientId} not found`), null];
  }
  return [null, row];
}

async function lookupProvider(
  sql: postgres.Sql,
  providerId: string,
): Promise<[Error | null, ProviderLookup | null]> {
  const rows = await sql<ProviderLookup[]>`
    SELECT provider_id, name, timezone FROM providers
    WHERE provider_id = ${providerId}::uuid AND is_active = true LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return [new Error(`Provider ${providerId} not found or inactive`), null];
  }
  return [null, row];
}

async function lookupService(
  sql: postgres.Sql,
  serviceId: string,
  providerId: string,
): Promise<[Error | null, ServiceLookup | null]> {
  const rows = await sql<ServiceLookup[]>`
    SELECT service_id, name, duration_minutes FROM services
    WHERE service_id = ${serviceId}::uuid
      AND provider_id = ${providerId}::uuid
      AND is_active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return [new Error(`Service ${serviceId} not found or inactive for this provider`), null];
  }
  return [null, row];
}

async function checkBlockedDate(
  sql: postgres.Sql,
  providerId: string,
  startTime: Date,
): Promise<[Error | null, null]> {
  const dateStr = startTime.toISOString().split('T')[0];
  if (dateStr === undefined) {
    return [new Error('Invalid date format'), null];
  }

  interface OverrideRow { readonly is_blocked: boolean }
  const overrides = await sql<OverrideRow[]>`
    SELECT is_blocked FROM schedule_overrides
    WHERE provider_id = ${providerId}::uuid
      AND override_date = ${dateStr}::date
      AND is_blocked = true
    LIMIT 1
  `;
  if (overrides[0] !== undefined) {
    return [new Error(`Provider unavailable on ${dateStr}`), null];
  }

  const dayOfWeek = startTime.getUTCDay();
  interface ScheduleRow { readonly schedule_id: string }
  const schedules = await sql<ScheduleRow[]>`
    SELECT schedule_id FROM provider_schedules
    WHERE provider_id = ${providerId}::uuid
      AND day_of_week = ${dayOfWeek}
      AND is_active = true
    LIMIT 1
  `;
  if (schedules[0] === undefined) {
    return [new Error(`Provider not available on day ${String(dayOfWeek)}`), null];
  }

  return [null, null];
}

async function checkSlotOverlap(
  sql: postgres.Sql,
  providerId: string,
  startTime: Date,
  endTime: Date,
): Promise<[Error | null, null]> {
  const rows = await sql<OverlapCheck[]>`
    SELECT booking_id FROM bookings
    WHERE provider_id = ${providerId}::uuid
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND start_time < ${endTime.toISOString()}::timestamptz
      AND end_time > ${startTime.toISOString()}::timestamptz
    LIMIT 1
  `;
  if (rows[0] !== undefined) {
    return [new Error('This time slot is already booked'), null];
  }
  return [null, null];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<{ success: boolean; data: BookingCreated | null; error_message: string | null }> {
  // 1. Validate input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const input: Readonly<CreateBookingInput> = parsed.data;

  // 2. Check required config
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // 3. Validate all references exist
    const [patientErr, patient] = await lookupPatient(sql, input.patient_id);
    if (patientErr !== null || patient === null) {
      return { success: false, data: null, error_message: patientErr?.message ?? 'Patient not found' };
    }

    const [providerErr, provider] = await lookupProvider(sql, input.provider_id);
    if (providerErr !== null || provider === null) {
      return { success: false, data: null, error_message: providerErr?.message ?? 'Provider not found' };
    }

    const [serviceErr, service] = await lookupService(sql, input.service_id, input.provider_id);
    if (serviceErr !== null || service === null) {
      return { success: false, data: null, error_message: serviceErr?.message ?? 'Service not found' };
    }

    // 4. Check date availability
    const [blockErr] = await checkBlockedDate(sql, input.provider_id, input.start_time);
    if (blockErr !== null) {
      return { success: false, data: null, error_message: blockErr.message };
    }

    // 5. Check slot overlap
    const durationMs = service.duration_minutes * 60 * 1000;
    const endTime = new Date(input.start_time.getTime() + durationMs);
    const [overlapErr] = await checkSlotOverlap(sql, input.provider_id, input.start_time, endTime);
    if (overlapErr !== null) {
      return { success: false, data: null, error_message: overlapErr.message };
    }

    // 6. Insert booking + audit trail atomically
    let booking: InsertedBooking | undefined;
    let txError: Error | undefined;

    try {
      booking = await sql.begin(async (tx) => {
        const rows: unknown[] = await tx.unsafe(
          `INSERT INTO bookings (
            patient_id, provider_id, service_id,
            start_time, end_time, status, idempotency_key, notes,
            gcal_sync_status, notification_sent,
            reminder_24h_sent, reminder_2h_sent, reminder_30min_sent
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid,
            $4::timestamptz, $5::timestamptz,
            'confirmed', $6, $7,
            'pending', false, false, false, false
          )
          ON CONFLICT (idempotency_key)
          DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
          RETURNING booking_id, status, start_time, end_time`,
          [
            input.patient_id,
            input.provider_id,
            input.service_id,
            input.start_time.toISOString(),
            endTime.toISOString(),
            input.idempotency_key,
            input.notes ?? null,
          ]
        );

interface CreatedBookingRow {
  booking_id: string;
  status: string;
  start_time: string;
  end_time: string;
  idempotent: boolean;
}

        const firstRow: CreatedBookingRow | undefined = rows[0] as CreatedBookingRow | undefined;
        if (firstRow === undefined) {
          throw new Error('INSERT returned no rows');
        }

        const inserted: InsertedBooking = {
          booking_id: String(firstRow['booking_id']),
          status: String(firstRow['status']),
          start_time: String(firstRow['start_time']),
          end_time: String(firstRow['end_time']),
        };

        await tx.unsafe(
          `INSERT INTO booking_audit (
            booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
          ) VALUES (
            $1::uuid, null, 'confirmed', $2, $3::uuid, $4, $5::jsonb
          )`,
          [
            inserted.booking_id,
            input.actor,
            input.patient_id,
            'Booking created',
            JSON.stringify({ channel: input.channel }),
          ]
        );

        return inserted;
      });
    } catch (e) {
      txError = e instanceof Error ? e : new Error(String(e));
    }

    if (txError !== undefined || booking === undefined) {
      const msg = txError?.message ?? 'Unknown transaction error';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        return { success: false, data: null, error_message: 'A booking with this idempotency key already exists' };
      }
      return { success: false, data: null, error_message: msg };
    }

    // 7. Fetch the created booking for return
    const resultRows = await sql`
      SELECT booking_id, status, start_time, end_time
      FROM bookings
      WHERE idempotency_key = ${input.idempotency_key}
      LIMIT 1
    `;
    const resultRow: CreatedBookingRow | undefined = resultRows[0] as CreatedBookingRow | undefined;
    if (resultRow === undefined) {
      return { success: false, data: null, error_message: 'Booking not found after insert' };
    }

    return {
      success: true,
      data: {
        booking_id: toUUID(resultRow.booking_id),
        status: resultRow.status,
        start_time: resultRow.start_time,
        end_time: resultRow.end_time,
        provider_name: provider.name,
        service_name: service.name,
        patient_name: patient.name,
      },
      error_message: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return { success: false, data: null, error_message: 'A booking with this idempotency key already exists' };
    }
    if (message.includes('booking_no_overlap') || message.includes('exclusion constraint')) {
      return { success: false, data: null, error_message: 'This time slot was just booked. Please choose a different time.' };
    }
    return { success: false, data: null, error_message: `Internal error: ${message}` };
  } finally {
    await sql.end();
  }
}
