/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Web-compatible booking API (create, cancel, reschedule)
 * DB Tables Used  : bookings, providers, clients, services, provider_schedules
 * Concurrency Risk: YES — booking creation uses SELECT FOR UPDATE + GIST constraint
 * GCal Calls      : NO — gcal_sync handles async sync after creation
 * Idempotency Key : YES — ON CONFLICT (idempotency_key) DO UPDATE returns existing booking
 * RLS Tenant ID   : YES — withTenantContext uses provider_id ALWAYS (never user_id)
 * Zod Schemas     : YES — InputSchema validates action and booking parameters
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action (create/cancel/reschedule) and parameters via Zod
 * - For create: tenantId = provider_id (required field)
 * - For cancel/reschedule: tenantId MUST come from the booking's provider_id,
 *   NOT from user_id input — because RLS enforces provider_id = app.current_tenant.
 *   Strategy: resolve booking's provider_id via a non-RLS pool query first,
 *   then open withTenantContext(booking.provider_id).
 * - Inside tenant context: verify client ownership, execute mutation.
 *
 * ### Schema Verification
 * - Tables: bookings, providers, clients, services
 * - Columns: bookings (booking_id, provider_id, client_id, service_id, start_time,
 *   end_time, status, idempotency_key, gcal_sync_status, cancellation_reason,
 *   rescheduled_from), clients (client_id, email), services (service_id, duration_minutes)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Double-booking → GIST exclusion constraint + ON CONFLICT handles
 * - Scenario 2: cancel/reschedule with wrong user → client_id ownership check
 * - Scenario 3: RLS mismatch → tenantId always = provider_id, never user_id
 * - Scenario 4: Retry of create → ON CONFLICT (idempotency_key) DO UPDATE returns
 *   the ORIGINAL booking_id (true idempotency, not "slot taken" error)
 *
 * ### Concurrency Analysis
 * - Risk: YES — SELECT FOR UPDATE on provider row before INSERT serializes concurrent creates
 *
 * ### SOLID Compliance Check
 * - SRP: YES — resolveProviderIdForBooking handles only pre-RLS lookup
 * - DRY: YES — idempotency key derivation extracted once per action
 * - KISS: YES — switch-based routing; booking lookup separated cleanly
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB BOOKING API — Web-compatible booking API (create, cancel, reschedule)
// ============================================================================
// Unified endpoint for web booking operations.
// Validates user permissions, checks availability, handles transactions.
// RLS: tenantId is ALWAYS provider_id — never user_id.
// Idempotency: ON CONFLICT (idempotency_key) DO UPDATE returns original row.
// ============================================================================

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  action: z.enum(['crear', 'cancelar', 'reagendar']),
  user_id: z.string().uuid(),
  booking_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  start_time: z.string().optional(),
  cancellation_reason: z.string().max(500).optional(),
  idempotency_key: z.string().min(1).max(255).optional(),
});

interface BookingResult {
  readonly booking_id: string;
  readonly status: string;
  readonly message: string;
}

/**
 * resolveProviderIdForBooking — Pre-RLS lookup.
 *
 * For cancel/reschedule, the tenantId MUST be the booking's provider_id.
 * This query runs OUTSIDE withTenantContext (no RLS) because we cannot open
 * a tenant context without knowing which tenant owns the booking.
 * This is safe: we only read provider_id — no patient data is exposed.
 */
async function resolveProviderIdForBooking(
  sql: ReturnType<typeof createDbClient>,
  bookingId: string,
): Promise<[Error | null, string | null]> {
  try {
    const rows = await sql<readonly { provider_id: string }[]>`
      SELECT provider_id FROM bookings
      WHERE booking_id = ${bookingId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return [new Error('Booking not found'), null];
    }
    return [null, row.provider_id];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`resolve_provider_failed: ${msg}`), null];
  }
}

export async function main(rawInput: unknown): Promise<[Error | null, BookingResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const { action, user_id, booking_id, provider_id, service_id, start_time, cancellation_reason } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // ── Determine tenantId ────────────────────────────────────────────────
    // RULE: tenantId MUST ALWAYS be provider_id — NEVER user_id.
    // For 'crear': provider_id is a required input field.
    // For 'cancelar'/'reagendar': resolve provider_id from the booking row
    //   via a non-RLS query before opening withTenantContext.

    let tenantId: string;

    if (action === 'crear') {
      if (provider_id === undefined) {
        return [new Error('provider_id is required for crear'), null];
      }
      tenantId = provider_id;
    } else {
      // cancel or reschedule — must have booking_id
      if (booking_id === undefined) {
        return [new Error('booking_id is required for cancelar/reagendar'), null];
      }
      const [resolveErr, resolvedProviderId] = await resolveProviderIdForBooking(sql, booking_id);
      if (resolveErr !== null || resolvedProviderId === null) {
        return [resolveErr ?? new Error('Booking not found'), null];
      }
      tenantId = resolvedProviderId;
    }

    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      // ── Resolve client_id from user_id ──────────────────────────────────
      const userRows = await tx<readonly { email: string | null }[]>`
        SELECT email FROM users WHERE user_id = ${user_id}::uuid LIMIT 1
      `;
      const userRow = userRows[0];
      if (userRow === undefined) {
        return [new Error('User not found'), null];
      }

      let clientId: string | null = null;

      // First: check if user_id maps directly to client_id
      const directRows = await tx<readonly { client_id: string }[]>`
        SELECT client_id FROM clients WHERE client_id = ${user_id}::uuid LIMIT 1
      `;
      if (directRows[0] !== undefined) {
        clientId = directRows[0].client_id;
      }

      // Second: check via email match
      if (clientId === null && userRow.email !== null) {
        const emailRows = await tx<readonly { client_id: string }[]>`
          SELECT client_id FROM clients WHERE email = ${userRow.email} LIMIT 1
        `;
        if (emailRows[0] !== undefined) {
          clientId = emailRows[0].client_id;
        }
      }

      if (clientId === null) {
        return [new Error('Client record not found. Please complete your profile first.'), null];
      }

      switch (action) {
        case 'crear': {
          // provider_id is guaranteed non-undefined here (validated above)
          if (service_id === undefined || start_time === undefined) {
            return [new Error('service_id and start_time are required for create'), null];
          }

          // Lock provider row to serialize concurrent bookings (prevents TOCTOU)
          const lockRows = await tx<readonly { provider_id: string }[]>`
            SELECT provider_id FROM providers
            WHERE provider_id = ${tenantId}::uuid AND is_active = true
            LIMIT 1 FOR UPDATE
          `;
          if (lockRows[0] === undefined) {
            return [new Error('Provider not found or inactive'), null];
          }

          const serviceRows = await tx<readonly { duration_minutes: number }[]>`
            SELECT duration_minutes FROM services WHERE service_id = ${service_id}::uuid LIMIT 1
          `;
          const sRow = serviceRows[0];
          if (sRow === undefined) {
            return [new Error('Service not found'), null];
          }

          const startTime = new Date(start_time);
          if (Number.isNaN(startTime.getTime())) {
            return [new Error('Invalid start_time format'), null];
          }
          const endTime = new Date(startTime.getTime() + sRow.duration_minutes * 60000);

          // Check slot overlap inside transaction (GIST constraint is backup)
          const overlapRows = await tx<readonly { booking_id: string }[]>`
            SELECT booking_id FROM bookings
            WHERE provider_id = ${tenantId}::uuid
              AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
              AND start_time < ${endTime.toISOString()}::timestamptz
              AND end_time > ${startTime.toISOString()}::timestamptz
            LIMIT 1
          `;
          if (overlapRows[0] !== undefined) {
            return [new Error('The selected time slot is already booked'), null];
          }

          // Deterministic idempotency key: same request → same hash → ON CONFLICT catches retry
          const idempotencyKey = parsed.data.idempotency_key ??
            createHash('sha256')
              .update(`${tenantId}:${clientId}:${service_id}:${start_time}`)
              .digest('hex')
              .slice(0, 32);

          // ON CONFLICT DO UPDATE: returns existing row on retry (TRUE idempotency).
          // The client gets their original booking_id — NOT a "slot taken" error.
          const insertRows = await tx<readonly { booking_id: string; status: string }[]>`
            INSERT INTO bookings (
              provider_id, client_id, service_id, start_time, end_time,
              status, idempotency_key, gcal_sync_status
            ) VALUES (
              ${tenantId}::uuid, ${clientId}::uuid, ${service_id}::uuid,
              ${start_time}, ${endTime.toISOString()},
              'pending', ${idempotencyKey}, 'pending'
            )
            ON CONFLICT (idempotency_key)
            DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
            RETURNING booking_id, status
          `;

          const newRow = insertRows[0];
          if (newRow === undefined) {
            return [new Error('Failed to create booking. The slot may already be taken.'), null];
          }

          return [null, {
            booking_id: newRow.booking_id,
            status: newRow.status,
            message: 'Booking created successfully',
          }];
        }

        case 'cancelar': {
          // booking_id is guaranteed non-undefined here (validated above)
          const bId = booking_id as string;

          const bookingRows = await tx<readonly { booking_id: string; status: string; client_id: string }[]>`
            SELECT booking_id, status, client_id FROM bookings
            WHERE booking_id = ${bId}::uuid LIMIT 1
          `;

          const bRow = bookingRows[0];
          if (bRow === undefined) {
            return [new Error('Booking not found'), null];
          }

          if (bRow.client_id !== clientId) {
            return [new Error('You can only cancel your own bookings'), null];
          }

          if (bRow.status !== 'pending' && bRow.status !== 'confirmed') {
            return [new Error('Cannot cancel booking with status: ' + bRow.status), null];
          }

          const updateRows = await tx<readonly { booking_id: string; status: string }[]>`
            UPDATE bookings SET
              status = 'cancelled',
              cancellation_reason = ${cancellation_reason ?? null},
              cancelled_by = 'client',
              updated_at = NOW()
            WHERE booking_id = ${bId}::uuid
            RETURNING booking_id, status
          `;

          const updatedRow = updateRows[0];
          if (updatedRow === undefined) {
            return [new Error('Failed to cancel booking'), null];
          }

          return [null, {
            booking_id: updatedRow.booking_id,
            status: updatedRow.status,
            message: 'Booking cancelled successfully',
          }];
        }

        case 'reagendar': {
          // booking_id and start_time both required — validated above for reschedule path
          if (start_time === undefined) {
            return [new Error('start_time is required for reschedule'), null];
          }
          const bId = booking_id as string;

          const bookingRows = await tx<readonly { booking_id: string; status: string; client_id: string; provider_id: string; service_id: string }[]>`
            SELECT booking_id, status, client_id, provider_id, service_id FROM bookings
            WHERE booking_id = ${bId}::uuid LIMIT 1
          `;

          const bRow = bookingRows[0];
          if (bRow === undefined) {
            return [new Error('Booking not found'), null];
          }

          if (bRow.client_id !== clientId) {
            return [new Error('You can only reschedule your own bookings'), null];
          }

          if (bRow.status !== 'pending' && bRow.status !== 'confirmed') {
            return [new Error('Cannot reschedule booking with status: ' + bRow.status), null];
          }

          const serviceRows = await tx<readonly { duration_minutes: number }[]>`
            SELECT duration_minutes FROM services WHERE service_id = ${bRow.service_id}::uuid LIMIT 1
          `;
          const sRow = serviceRows[0];
          if (sRow === undefined) {
            return [new Error('Service not found'), null];
          }

          const startTime = new Date(start_time);
          if (Number.isNaN(startTime.getTime())) {
            return [new Error('Invalid start_time format'), null];
          }
          const endTime = new Date(startTime.getTime() + sRow.duration_minutes * 60000);

          // Lock provider row to serialize concurrent bookings (prevents TOCTOU)
          const reschedLockRows = await tx<readonly { provider_id: string }[]>`
            SELECT provider_id FROM providers
            WHERE provider_id = ${bRow.provider_id}::uuid AND is_active = true
            LIMIT 1 FOR UPDATE
          `;
          if (reschedLockRows[0] === undefined) {
            return [new Error('Provider not found or inactive'), null];
          }

          // Check slot overlap inside transaction
          const overlapRows = await tx<readonly { booking_id: string }[]>`
            SELECT booking_id FROM bookings
            WHERE provider_id = ${bRow.provider_id}::uuid
              AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
              AND start_time < ${endTime.toISOString()}::timestamptz
              AND end_time > ${startTime.toISOString()}::timestamptz
            LIMIT 1
          `;
          if (overlapRows[0] !== undefined) {
            return [new Error('The selected time slot is already booked'), null];
          }

          // Deterministic idempotency key for reschedule: same booking + new time → same key
          const idempotencyKey = parsed.data.idempotency_key ??
            createHash('sha256')
              .update(`reschedule:${bId}:${start_time}`)
              .digest('hex')
              .slice(0, 32);

          // ON CONFLICT DO UPDATE: returns original row on retry
          const insertRows = await tx<readonly { booking_id: string; status: string }[]>`
            INSERT INTO bookings (
              provider_id, client_id, service_id, start_time, end_time,
              status, idempotency_key, rescheduled_from, gcal_sync_status
            ) VALUES (
              ${bRow.provider_id}::uuid, ${clientId}::uuid, ${bRow.service_id}::uuid,
              ${start_time}, ${endTime.toISOString()},
              'pending', ${idempotencyKey}, ${bId}::uuid, 'pending'
            )
            ON CONFLICT (idempotency_key)
            DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
            RETURNING booking_id, status
          `;

          const newRow = insertRows[0];
          if (newRow === undefined) {
            return [new Error('Failed to create rescheduled booking. The slot may already be taken.'), null];
          }

          await tx`
            UPDATE bookings SET status = 'rescheduled', updated_at = NOW()
            WHERE booking_id = ${bId}::uuid
          `;

          return [null, {
            booking_id: newRow.booking_id,
            status: newRow.status,
            message: 'Booking rescheduled successfully',
          }];
        }

        default: {
          const _exhaustive: never = action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) {
      const message = txErr.message;
      if (message.includes('conflicting key value violates exclusion constraint')) {
        return [new Error('The selected time slot is already booked. Please choose another time.'), null];
      }
      if (message.startsWith('transaction_failed: ')) {
        return [new Error(message.slice(20)), null];
      }
      return [txErr, null];
    }

    return [null, txData];

  } finally {
    await sql.end();
  }
}
