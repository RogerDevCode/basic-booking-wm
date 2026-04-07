// ============================================================================
// BOOKING CREATE — Create a new medical appointment
// ============================================================================
// Go-style: no throw for control flow, no any, no as.
// All errors returned as Error values. All DB operations use withTenantContext.
// Overlap check is inside the transaction to prevent race conditions.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import type { UUID } from '../internal/db-types';
import { toUUID } from '../internal/db-types';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

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

// ─── Typed Row Interfaces ───────────────────────────────────────────────────
interface ClientLookup {
  readonly client_id: string;
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

interface InsertedBooking {
  readonly booking_id: string;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
}

interface OverlapRow {
  readonly booking_id: string;
}

interface InsertResult {
  readonly booking_id: string;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
}

// ─── Validation Functions (return [Error | null, Result | null]) ────────────
async function lookupClient(
  sql: postgres.Sql,
  clientId: string,
): Promise<[Error | null, ClientLookup | null]> {
  const rows = await sql.values<[string, string][]>`
    SELECT client_id, name FROM clients WHERE client_id = ${clientId}::uuid LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return [new Error(`Client ${clientId} not found`), null];
  }
  const result: ClientLookup = { client_id: row[0], name: row[1] };
  return [null, result];
}

async function lookupProvider(
  sql: postgres.Sql,
  providerId: string,
): Promise<[Error | null, ProviderLookup | null]> {
  const rows = await sql.values<[string, string, string][]>`
    SELECT provider_id, name, timezone FROM providers
    WHERE provider_id = ${providerId}::uuid AND is_active = true LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return [new Error(`Provider ${providerId} not found or inactive`), null];
  }
  const result: ProviderLookup = { provider_id: row[0], name: row[1], timezone: row[2] };
  return [null, result];
}

async function lookupService(
  sql: postgres.Sql,
  serviceId: string,
  providerId: string,
): Promise<[Error | null, ServiceLookup | null]> {
  const rows = await sql.values<[string, string, number][]>`
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
  const result: ServiceLookup = { service_id: row[0], name: row[1], duration_minutes: row[2] };
  return [null, result];
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

  const overrides = await sql.values<[boolean][]>`
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
  const schedules = await sql.values<[string][]>`
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

// ─── Main Entry Point ───────────────────────────────────────────────────────
export async function main(
  rawInput: unknown,
): Promise<[Error | null, BookingCreated | null]> {
  // 1. Validate input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<CreateBookingInput> = parsed.data;

  // 2. Check required config
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Validate all references exist (outside transaction — read-only)
    const [clientErr, client] = await lookupClient(sql, input.client_id);
    if (clientErr !== null || client === null) {
      return [clientErr ?? new Error('Client not found'), null];
    }

    const [providerErr, provider] = await lookupProvider(sql, input.provider_id);
    if (providerErr !== null || provider === null) {
      return [providerErr ?? new Error('Provider not found'), null];
    }

    const [serviceErr, service] = await lookupService(sql, input.service_id, input.provider_id);
    if (serviceErr !== null || service === null) {
      return [serviceErr ?? new Error('Service not found'), null];
    }

    // 4. Check date availability (outside transaction — read-only)
    const [blockErr] = await checkBlockedDate(sql, input.provider_id, input.start_time);
    if (blockErr !== null) {
      return [blockErr, null];
    }

    // 5-6. Overlap check + INSERT inside transaction with RLS tenant context
    const durationMs = service.duration_minutes * 60 * 1000;
    const endTime = new Date(input.start_time.getTime() + durationMs);

    const [txErr, booking] = await withTenantContext<InsertedBooking>(
      sql,
      input.provider_id,
      async (tx) => {
        // 5. Check slot overlap INSIDE transaction (prevents race condition)
        const overlapRows = await tx.values<[string][]>`
          SELECT booking_id FROM bookings
          WHERE provider_id = ${input.provider_id}::uuid
            AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
            AND start_time < ${endTime.toISOString()}::timestamptz
            AND end_time > ${input.start_time.toISOString()}::timestamptz
          LIMIT 1
        `;
        if (overlapRows[0] !== undefined) {
          return [new Error('This time slot is already booked'), null];
        }

        // 6. Insert booking + audit trail atomically
        const insertRows = await tx.values<[string, string, string, string][]>`
          INSERT INTO bookings (
            client_id, provider_id, service_id,
            start_time, end_time, status, idempotency_key, notes,
            gcal_sync_status, notification_sent
          ) VALUES (
            ${input.client_id}::uuid, ${input.provider_id}::uuid, ${input.service_id}::uuid,
            ${input.start_time.toISOString()}::timestamptz, ${endTime.toISOString()}::timestamptz,
            'confirmed', ${input.idempotency_key}, ${input.notes ?? null},
            'pending', false
          )
          ON CONFLICT (idempotency_key)
          DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
          RETURNING booking_id, status, start_time, end_time
        `;

        const firstRow = insertRows[0];
        if (firstRow === undefined) {
          return [new Error('INSERT returned no rows'), null];
        }

        const inserted: InsertedBooking = {
          booking_id: firstRow[0],
          status: firstRow[1],
          start_time: firstRow[2],
          end_time: firstRow[3],
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
            input.client_id,
            'Booking created',
            JSON.stringify({ channel: input.channel }),
          ],
        );

        return [null, inserted];
      },
    );

    if (txErr !== null || booking === null) {
      const msg = txErr?.message ?? 'Unknown transaction error';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        return [new Error('A booking with this idempotency key already exists'), null];
      }
      if (msg.includes('booking_no_overlap') || msg.includes('exclusion constraint')) {
        return [new Error('This time slot was just booked. Please choose a different time.'), null];
      }
      return [txErr ?? new Error(msg), null];
    }

    // 7. Build result (data already available from INSERT RETURNING)
    const result: BookingCreated = {
      booking_id: toUUID(booking.booking_id),
      status: booking.status,
      start_time: booking.start_time,
      end_time: booking.end_time,
      provider_name: provider.name,
      service_name: service.name,
      client_name: client.name,
    };

    return [null, result];
  } catch (e) {
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
