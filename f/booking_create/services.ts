import type { TxClient } from '../internal/tenant-context/index';
import type { Result } from '../internal/result/index';
import type { Input, BookingContext, BookingCreated } from './types';
import { validateTransition } from '../internal/state-machine/index';
import { toUUID } from '../internal/db-types/index';
import type { BookingStatus } from '../internal/db-types/index';

export async function fetchBookingContext(
  tx: TxClient,
  input: Input
): Promise<Result<BookingContext>> {
  const clientRows = await tx.values<[string, string][]>`
    SELECT client_id, name FROM clients WHERE client_id = ${input.client_id}::uuid LIMIT 1
  `;
  if (!clientRows[0]) return [new Error(`Client ${input.client_id} not found`), null];

  const providerRows = await tx.values<[string, string, string][]>`
    SELECT provider_id, name, timezone FROM providers
    WHERE provider_id = ${input.provider_id}::uuid AND is_active = true
    LIMIT 1
    FOR UPDATE
  `;
  if (!providerRows[0]) return [new Error(`Provider ${input.provider_id} not found or inactive`), null];

  const serviceRows = await tx.values<[string, string, number][]>`
    SELECT service_id, name, duration_minutes FROM services
    WHERE service_id = ${input.service_id}::uuid
      AND provider_id = ${input.provider_id}::uuid
      AND is_active = true
    LIMIT 1
  `;
  if (!serviceRows[0]) return [new Error(`Service ${input.service_id} not found or inactive for this provider`), null];

  return [null, {
    client: { id: clientRows[0][0], name: clientRows[0][1] },
    provider: { id: providerRows[0][0], name: providerRows[0][1], timezone: providerRows[0][2] },
    service: { id: serviceRows[0][0], name: serviceRows[0][1], duration: serviceRows[0][2] }
  }];
}

export async function checkAvailability(
  tx: TxClient,
  input: Input,
  endTime: Date
): Promise<Result<void>> {
  const dateStr = input.start_time.toISOString().split('T')[0];
  if (!dateStr) return [new Error('Invalid date format'), null];

  const overrideRows = await tx.values<[boolean][]>`
    SELECT is_blocked FROM schedule_overrides
    WHERE provider_id = ${input.provider_id}::uuid
      AND override_date = ${dateStr}::date
      AND is_blocked = true
    LIMIT 1
  `;
  if (overrideRows[0]) return [new Error(`Provider unavailable on ${dateStr}`), null];

  const dayOfWeek = input.start_time.getUTCDay();
  const scheduleRows = await tx.values<[string][]>`
    SELECT schedule_id FROM provider_schedules
    WHERE provider_id = ${input.provider_id}::uuid
      AND day_of_week = ${dayOfWeek}
      AND is_active = true
    LIMIT 1
  `;
  if (!scheduleRows[0]) return [new Error(`Provider not available on day ${String(dayOfWeek)}`), null];

  const overlapRows = await tx.values<[string][]>`
    SELECT booking_id FROM bookings
    WHERE provider_id = ${input.provider_id}::uuid
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND start_time < ${endTime.toISOString()}::timestamptz
      AND end_time > ${input.start_time.toISOString()}::timestamptz
    LIMIT 1
  `;
  if (overlapRows[0]) return [new Error('This time slot is already booked'), null];

  return [null, undefined];
}

export async function persistBooking(
  tx: TxClient,
  input: Input,
  context: BookingContext,
  endTime: Date
): Promise<Result<BookingCreated>> {
  const initialStatus: BookingStatus = 'pending';
  const targetStatus: BookingStatus = 'confirmed';

  const [transitionErr] = validateTransition(initialStatus, targetStatus);
  if (transitionErr !== null) return [transitionErr, null];

  const insertRows = await tx.values<[string, string, string, string][]>`
    INSERT INTO bookings (
      client_id, provider_id, service_id,
      start_time, end_time, status, idempotency_key, notes,
      gcal_sync_status, notification_sent,
      reminder_24h_sent, reminder_2h_sent, reminder_30min_sent
    ) VALUES (
      ${input.client_id}::uuid, ${input.provider_id}::uuid, ${input.service_id}::uuid,
      ${input.start_time.toISOString()}::timestamptz, ${endTime.toISOString()}::timestamptz,
      ${targetStatus}, ${input.idempotency_key}, ${input.notes ?? null},
      'pending', false,
      false, false, false
    )
    ON CONFLICT (idempotency_key)
    DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
    RETURNING booking_id, status, start_time, end_time
  `;

  const row = insertRows[0];
  if (!row) return [new Error('INSERT returned no rows'), null];

  await tx.unsafe(
    `INSERT INTO booking_audit (
      booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
    ) VALUES (
      $1::uuid, $2, $3, $4, $5::uuid, $6, $7::jsonb
    )`,
    [
      row[0],
      initialStatus,
      targetStatus,
      input.actor,
      input.client_id,
      'Booking created',
      JSON.stringify({ channel: input.channel }),
    ],
  );

  const bookingId = toUUID(row[0]);
  if (!bookingId) return [new Error('Invalid booking_id returned from DB'), null];

  return [null, {
    booking_id: bookingId,
    status: row[1],
    start_time: row[2],
    end_time: row[3],
    provider_name: context.provider.name,
    service_name: context.service.name,
    client_name: context.client.name,
  }];
}