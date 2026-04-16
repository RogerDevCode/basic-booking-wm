/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Refactor Web Booking API to SOLID standards
 * DB Tables Used  : providers, services, bookings, clients, users
 * Concurrency Risk: YES — uses SELECT FOR UPDATE on provider row
 * GCal Calls      : NO — handled by async background sync
 * Idempotency Key : YES — deterministic SHA-256 derivation
 * RLS Tenant ID   : YES — withTenantContext enforces provider_id isolation
 * Zod Schemas     : YES — InputSchema validation
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ============================================================================
// SCHEMAS & TYPES
// ============================================================================

const InputSchema = z.object({
  action: z.enum(['crear', 'cancelar', 'reagendar']),
  user_id: z.uuid(),
  booking_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  service_id: z.uuid().optional(),
  start_time: z.string().optional(),
  cancellation_reason: z.string().max(500).optional(),
  idempotency_key: z.string().min(1).max(255).optional(),
});

type Input = z.infer<typeof InputSchema>;

interface BookingResult {
  readonly booking_id: string;
  readonly status: string;
  readonly message: string;
}

type DB = ReturnType<typeof createDbClient>;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generates a deterministic idempotency key if none provided.
 */
function deriveIdempotencyKey(prefix: string, parts: readonly string[]): string {
  return createHash('sha256')
    .update(`${prefix}:${parts.join(':')}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Calculates end_time based on duration.
 */
function calculateEndTime(startTimeStr: string, durationMinutes: number): [Error | null, string | null] {
  const start = new Date(startTimeStr);
  if (Number.isNaN(start.getTime())) {
    return [new Error('formato_fecha_invalido'), null];
  }
  return [null, new Date(start.getTime() + durationMinutes * 60000).toISOString()];
}

// ============================================================================
// IDENTITY & CONTEXT RESOLUTION
// ============================================================================

/**
 * Resolves the tenant (provider_id) for an existing booking.
 * Runs outside RLS context to identify the owner.
 */
async function resolveTenantForBooking(sql: DB, bookingId: string): Promise<Result<string>> {
  try {
    const rows = await sql<readonly { provider_id: string }[]>`
      SELECT provider_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
    `;
    const providerId = rows[0]?.provider_id;
    if (!providerId) return [new Error('cita_no_encontrada'), null];
    return [null, providerId];
  } catch (e) {
    return [new Error(`error_resolucion_tenant: ${String(e)}`), null];
  }
}

/**
 * Resolves client_id from user_id (identity mapping).
 */
async function resolveClientId(tx: DB, userId: string): Promise<Result<string>> {
  try {
    // 1. Check direct map
    const directRows = await tx<readonly { client_id: string }[]>`
      SELECT client_id FROM clients WHERE client_id = ${userId}::uuid LIMIT 1
    `;
    if (directRows[0]) return [null, directRows[0].client_id];

    // 2. Check via email
    const userRows = await tx<readonly { email: string | null }[]>`
      SELECT email FROM users WHERE user_id = ${userId}::uuid LIMIT 1
    `;
    const email = userRows[0]?.email;
    if (email) {
      const emailRows = await tx<readonly { client_id: string }[]>`
        SELECT client_id FROM clients WHERE email = ${email} LIMIT 1
      `;
      if (emailRows[0]) return [null, emailRows[0].client_id];
    }

    return [new Error('cliente_no_registrado'), null];
  } catch (e) {
    return [new Error(`error_resolucion_cliente: ${String(e)}`), null];
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handles 'crear' action logic.
 */
async function handleCrear(
  tx: DB,
  tenantId: string,
  clientId: string,
  input: Input
): Promise<Result<BookingResult>> {
  const { service_id, start_time } = input;
  if (!service_id || !start_time) return [new Error('datos_insuficientes_crear'), null];

  // Concurrency Lock: Provider serialization
  const lock = await tx`SELECT provider_id FROM providers WHERE provider_id = ${tenantId}::uuid AND is_active = true FOR UPDATE`;
  if (!lock[0]) return [new Error('proveedor_inactivo'), null];

  const service = await tx<{ duration_minutes: number }[]>`SELECT duration_minutes FROM services WHERE service_id = ${service_id}::uuid LIMIT 1`;
  if (!service[0]) return [new Error('servicio_no_encontrado'), null];

  const [timeErr, endTime] = calculateEndTime(start_time, service[0].duration_minutes);
  if (timeErr || !endTime) return [timeErr ?? new Error('error_tiempo'), null];

  // Overlap check
  const overlap = await tx`
    SELECT booking_id FROM bookings
    WHERE provider_id = ${tenantId}::uuid
      AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
      AND start_time < ${endTime}::timestamptz
      AND end_time > ${start_time}::timestamptz
    LIMIT 1
  `;
  if (overlap[0]) return [new Error('horario_ocupado'), null];

  const idempotencyKey = input.idempotency_key ?? deriveIdempotencyKey('crear', [tenantId, clientId, service_id, start_time]);

  const rows = await tx<{ booking_id: string; status: string }[]>`
    INSERT INTO bookings (
      provider_id, client_id, service_id, start_time, end_time,
      status, idempotency_key, gcal_sync_status
    ) VALUES (
      ${tenantId}::uuid, ${clientId}::uuid, ${service_id}::uuid,
      ${start_time}, ${endTime},
      'pendiente', ${idempotencyKey}, 'pending'
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
    RETURNING booking_id, status
  `;

  if (!rows[0]) return [new Error('error_creacion_cita'), null];

  return [null, {
    booking_id: rows[0].booking_id,
    status: rows[0].status,
    message: 'Cita creada exitosamente',
  }];
}

/**
 * Handles 'cancelar' action logic.
 */
async function handleCancelar(
  tx: DB,
  clientId: string,
  input: Input
): Promise<Result<BookingResult>> {
  const { booking_id, cancellation_reason } = input;
  if (!booking_id) return [new Error('booking_id_requerido'), null];

  const booking = await tx<{ status: string; client_id: string }[]>`
    SELECT status, client_id FROM bookings WHERE booking_id = ${booking_id}::uuid LIMIT 1
  `;
  if (!booking[0]) return [new Error('cita_no_encontrada'), null];
  if (booking[0].client_id !== clientId) return [new Error('permiso_denegado_cita'), null];

  if (!['pendiente', 'confirmada'].includes(booking[0].status)) {
    return [new Error(`estado_invalido_cancelar: ${booking[0].status}`), null];
  }

  const rows = await tx<{ booking_id: string; status: string }[]>`
    UPDATE bookings SET
      status = 'cancelada',
      cancellation_reason = ${cancellation_reason ?? null},
      updated_at = NOW()
    WHERE booking_id = ${booking_id}::uuid
    RETURNING booking_id, status
  `;

  if (!rows[0]) return [new Error('error_cancelacion_cita'), null];

  return [null, {
    booking_id: rows[0].booking_id,
    status: rows[0].status,
    message: 'Cita cancelada exitosamente',
  }];
}

/**
 * Handles 'reagendar' action logic.
 */
async function handleReagendar(
  tx: DB,
  tenantId: string,
  clientId: string,
  input: Input
): Promise<Result<BookingResult>> {
  const { booking_id, start_time } = input;
  if (!booking_id || !start_time) return [new Error('datos_insuficientes_reagendar'), null];

  const old = await tx<{ service_id: string; status: string; client_id: string }[]>`
    SELECT service_id, status, client_id FROM bookings WHERE booking_id = ${booking_id}::uuid LIMIT 1
  `;
  if (!old[0]) return [new Error('cita_no_encontrada'), null];
  if (old[0].client_id !== clientId) return [new Error('permiso_denegado_cita'), null];
  if (!['pendiente', 'confirmada'].includes(old[0].status)) return [new Error('estado_invalido_reagendar'), null];

  const service = await tx<{ duration_minutes: number }[]>`SELECT duration_minutes FROM services WHERE service_id = ${old[0].service_id}::uuid LIMIT 1`;
  if (!service[0]) return [new Error('servicio_no_encontrado'), null];

  const [timeErr, endTime] = calculateEndTime(start_time, service[0].duration_minutes);
  if (timeErr || !endTime) return [timeErr ?? new Error('error_tiempo'), null];

  // Concurrency Lock
  await tx`SELECT provider_id FROM providers WHERE provider_id = ${tenantId}::uuid AND is_active = true FOR UPDATE`;

  // Overlap check
  const overlap = await tx`
    SELECT booking_id FROM bookings
    WHERE provider_id = ${tenantId}::uuid
      AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
      AND start_time < ${endTime}::timestamptz
      AND end_time > ${start_time}::timestamptz
    LIMIT 1
  `;
  if (overlap[0]) return [new Error('horario_ocupado'), null];

  const idempotencyKey = input.idempotency_key ?? deriveIdempotencyKey('reagendar', [booking_id, start_time]);

  const rows = await tx<{ booking_id: string; status: string }[]>`
    INSERT INTO bookings (
      provider_id, client_id, service_id, start_time, end_time,
      status, idempotency_key, rescheduled_from, gcal_sync_status
    ) VALUES (
      ${tenantId}::uuid, ${clientId}::uuid, ${old[0].service_id}::uuid,
      ${start_time}, ${endTime},
      'pendiente', ${idempotencyKey}, ${booking_id}::uuid, 'pending'
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
    RETURNING booking_id, status
  `;

  if (!rows[0]) return [new Error('error_reagendar_cita'), null];

  await tx`UPDATE bookings SET status = 'reagendada', updated_at = NOW() WHERE booking_id = ${booking_id}::uuid`;

  return [null, {
    booking_id: rows[0].booking_id,
    status: rows[0].status,
    message: 'Cita reagendada exitosamente',
  }];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<BookingResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return [new Error(`error_validacion: ${parsed.error.message}`), null];

  const dbUrl = process.env['DATABASE_URL'] || '';
  if (!dbUrl) return [new Error('configuracion_db_faltante'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    const input = parsed.data;

    // 1. Resolve Tenant ID
    let tenantId: string;
    if (input.action === 'crear') {
      if (!input.provider_id) return [new Error('provider_id_requerido'), null];
      tenantId = input.provider_id;
    } else {
      if (!input.booking_id) return [new Error('booking_id_requerido'), null];
      const [err, resolved] = await resolveTenantForBooking(sql, input.booking_id);
      if (err || !resolved) return [err ?? new Error('resolucion_tenant_fallida'), null];
      tenantId = resolved;
    }

    // 2. Execute within Tenant Context
    return await withTenantContext(sql, tenantId, async (tx) => {
      const [clientErr, clientId] = await resolveClientId(tx, input.user_id);
      if (clientErr || !clientId) return [clientErr ?? new Error('resolucion_cliente_fallida'), null];

      switch (input.action) {
        case 'crear':     return handleCrear(tx, tenantId, clientId, input);
        case 'cancelar':  return handleCancelar(tx, clientId, input);
        case 'reagendar': return handleReagendar(tx, tenantId, clientId, input);
        default: {
            const _exhaustive: never = input.action;
            return [new Error(`accion_no_soportada: ${String(_exhaustive)}`), null];
        }
      }
    });

  } catch (e) {
    return [new Error(`error_inesperado: ${String(e)}`), null];
  } finally {
    await sql.end();
  }
}
