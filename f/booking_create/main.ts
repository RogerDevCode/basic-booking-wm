/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Create a new medical appointment (SOLID Refactor)
 * DB Tables Used  : bookings, providers, clients, services, schedule_overrides, provider_schedules, booking_audit
 * Concurrency Risk: YES — GIST exclusion constraint + SELECT FOR UPDATE on provider
 * GCal Calls      : NO — gcal_sync handles async sync after creation
 * Idempotency Key : YES — ON CONFLICT (idempotency_key) handled
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input using Zod.
 * - Establish DB client and tenant context.
 * - Inside transaction:
 *   - fetchBookingContext: Verify client, provider (lock), and service existence.
 *   - checkAvailability: Validate against overrides, schedules, and existing overlaps.
 *   - persistBooking: Insert booking record (handle idempotency) and audit entry.
 * - Return structured result or error tuple.
 *
 * ### SOLID Compliance
 * - SRP: Logic split into fetchBookingContext, checkAvailability, and persistBooking.
 * - DRY: Shared Row interfaces and centralized Result type.
 * - KISS: Linear flow with clear error handling.
 *
 * ### Concurrency Analysis
 * - SELECT FOR UPDATE on providers row serializes booking attempts for the same provider.
 * - GIST exclusion constraint on bookings table provides safety at the database level.
 */

import { z } from 'zod';
import type { UUID, BookingStatus } from '../internal/db-types';
import { toUUID } from '../internal/db-types';
import { withTenantContext, type TxClient } from '../internal/tenant-context';
import { validateTransition } from '../internal/state-machine';
import { createDbClient } from '../internal/db/client';
import { logger } from '../internal/logger';
import type { Result } from '../internal/result';

// ─── Input Validation ───────────────────────────────────────────────────────
const InputSchema = z.object({
  client_id: z.uuid(),
  provider_id: z.uuid(),
  service_id: z.uuid(),
  start_time: z.coerce.date(),
  idempotency_key: z.string().min(1),
  notes: z.string().optional(),
  actor: z.enum(['client', 'provider', 'system']).default('client'),
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
  readonly client_name: string;
}

// ─── Internal Context Type ──────────────────────────────────────────────────
interface BookingContext {
  readonly client: { readonly id: string; readonly name: string };
  readonly provider: { readonly id: string; readonly name: string; readonly timezone: string };
  readonly service: { readonly id: string; readonly name: string; readonly duration: number };
}

// ─── SRP Helper Functions ───────────────────────────────────────────────────

/**
 * Verifies that the client, provider, and service exist and are active.
 * Locks the provider row to serialize concurrent booking attempts.
 */
async function fetchBookingContext(
  tx: TxClient,
  input: Readonly<CreateBookingInput>
): Promise<Result<BookingContext>> {
  // 1. Lookup Client
  const clientRows = await tx.values<[string, string][]>`
    SELECT client_id, name FROM clients WHERE client_id = ${input.client_id}::uuid LIMIT 1
  `;
  if (!clientRows[0]) return [new Error(`Client ${input.client_id} not found`), null];

  // 2. Lock Provider (Serializes concurrent bookings)
  const providerRows = await tx.values<[string, string, string][]>`
    SELECT provider_id, name, timezone FROM providers
    WHERE provider_id = ${input.provider_id}::uuid AND is_active = true
    LIMIT 1
    FOR UPDATE
  `;
  if (!providerRows[0]) return [new Error(`Provider ${input.provider_id} not found or inactive`), null];

  // 3. Lookup Service
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

/**
 * Checks provider schedule and existing bookings to ensure the slot is available.
 */
async function checkAvailability(
  tx: TxClient,
  input: Readonly<CreateBookingInput>,
  endTime: Date
): Promise<Result<void>> {
  const dateStr = input.start_time.toISOString().split('T')[0];
  if (!dateStr) return [new Error('Invalid date format'), null];

  // 1. Check Schedule Overrides
  const overrideRows = await tx.values<[boolean][]>`
    SELECT is_blocked FROM schedule_overrides
    WHERE provider_id = ${input.provider_id}::uuid
      AND override_date = ${dateStr}::date
      AND is_blocked = true
    LIMIT 1
  `;
  if (overrideRows[0]) return [new Error(`Provider unavailable on ${dateStr}`), null];

  // 2. Check Weekly Schedule
  const dayOfWeek = input.start_time.getUTCDay();
  const scheduleRows = await tx.values<[string][]>`
    SELECT schedule_id FROM provider_schedules
    WHERE provider_id = ${input.provider_id}::uuid
      AND day_of_week = ${dayOfWeek}
      AND is_active = true
    LIMIT 1
  `;
  if (!scheduleRows[0]) return [new Error(`Provider not available on day ${String(dayOfWeek)}`), null];

  // 3. Check Overlaps
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

/**
 * Inserts the booking and creates an audit trail entry.
 */
async function persistBooking(
  tx: TxClient,
  input: Readonly<CreateBookingInput>,
  context: BookingContext,
  endTime: Date
): Promise<Result<BookingCreated>> {
  const initialStatus: BookingStatus = 'pending';
  const targetStatus: BookingStatus = 'confirmed';

  // 1. State machine validation
  const [transitionErr] = validateTransition(initialStatus, targetStatus);
  if (transitionErr !== null) return [transitionErr, null];

  // 2. Insert Booking
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

  // 3. Insert Audit Trail
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

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<Result<BookingCreated>> {
  const MODULE = 'booking_create';

  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.error(MODULE, 'Validation failed', parsed.error);
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }
  const input: Readonly<CreateBookingInput> = parsed.data;

  // 2. Initialize DB
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txResult] = await withTenantContext<BookingCreated>(
      sql,
      input.provider_id,
      async (tx) => {
        // Step A: Fetch Context (Client, Provider, Service)
        const [ctxErr, context] = await fetchBookingContext(tx, input);
        if (ctxErr !== null || !context) return [ctxErr, null];

        // Step B: Availability & Overlap Checks
        const durationMs = context.service.duration * 60 * 1000;
        const endTime = new Date(input.start_time.getTime() + durationMs);
        const [availErr] = await checkAvailability(tx, input, endTime);
        if (availErr !== null) return [availErr, null];

        // Step C: Persist Data
        return persistBooking(tx, input, context, endTime);
      }
    );

    if (txErr !== null) {
      logger.error(MODULE, 'Transaction failed', txErr, { idempotency_key: input.idempotency_key });
      const msg = txErr.message;
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        return [new Error('A booking with this idempotency key already exists'), null];
      }
      if (msg.includes('booking_no_overlap') || msg.includes('exclusion constraint')) {
        return [new Error('This time slot was just booked. Please choose a different time.'), null];
      }
      return [txErr, null];
    }

    logger.info(MODULE, 'Booking creation complete', { booking_id: txResult?.booking_id });
    return [null, txResult as BookingCreated];

  } catch (e) {
    logger.error(MODULE, 'Unexpected infrastructure error', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      return [new Error('A booking with this idempotency key already exists'), null];
    }
    if (message.includes('booking_no_overlap') || message.includes('exclusion constraint')) {
      return [new Error('This time slot was just booked. Please choose a different time.'), null];
    }
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
