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
// UTILS — Domain-agnostic logic
// ============================================================================

const Utils = {
  /**
   * Generates a deterministic idempotency key.
   */
  deriveIdempotencyKey(prefix: string, parts: readonly string[]): string {
    return createHash('sha256')
      .update(`${prefix}:${parts.join(':')}`)
      .digest('hex')
      .slice(0, 32);
  },

  /**
   * Safe date calculation.
   */
  calculateEndTime(startTimeStr: string, durationMinutes: number): Result<string> {
    const start = new Date(startTimeStr);
    if (Number.isNaN(start.getTime())) {
      return [new Error('formato_fecha_invalido'), null];
    }
    return [null, new Date(start.getTime() + durationMinutes * 60000).toISOString()];
  },
} as const;

// ============================================================================
// REPOSITORY — Pure Database Operations
// ============================================================================

const Repository = {
  async resolveTenantForBooking(sql: DB, bookingId: string): Promise<Result<string>> {
    try {
      const rows = await sql<readonly { provider_id: string }[]>`
        SELECT provider_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
      `;
      return rows[0] ? [null, rows[0].provider_id] : [new Error('cita_no_encontrada'), null];
    } catch (e) {
      return [new Error(`error_db_resolucion_tenant: ${String(e)}`), null];
    }
  },

  async resolveClientId(tx: DB, userId: string): Promise<Result<string>> {
    try {
      // Direct lookup by ID
      const direct = await tx<readonly { client_id: string }[]>`
        SELECT client_id FROM clients WHERE client_id = ${userId}::uuid LIMIT 1
      `;
      if (direct[0]) return [null, direct[0].client_id];

      // Identity lookup via email
      const user = await tx<readonly { email: string | null }[]>`
        SELECT email FROM users WHERE user_id = ${userId}::uuid LIMIT 1
      `;
      if (!user[0]?.email) return [new Error('cliente_no_registrado'), null];

      const client = await tx<readonly { client_id: string }[]>`
        SELECT client_id FROM clients WHERE email = ${user[0].email} LIMIT 1
      `;
      return client[0] ? [null, client[0].client_id] : [new Error('cliente_no_registrado'), null];
    } catch (e) {
      return [new Error(`error_db_resolucion_cliente: ${String(e)}`), null];
    }
  },

  async lockProvider(tx: DB, providerId: string): Promise<Result<boolean>> {
    const rows = await tx`SELECT provider_id FROM providers WHERE provider_id = ${providerId}::uuid AND is_active = true FOR UPDATE`;
    return rows[0] ? [null, true] : [new Error('proveedor_inactivo'), null];
  },

  async getServiceDuration(tx: DB, serviceId: string): Promise<Result<number>> {
    const rows = await tx<{ duration_minutes: number }[]>`SELECT duration_minutes FROM services WHERE service_id = ${serviceId}::uuid LIMIT 1`;
    return rows[0] ? [null, rows[0].duration_minutes] : [new Error('servicio_no_encontrado'), null];
  },

  async checkOverlap(tx: DB, providerId: string, startTime: string, endTime: string, ignoreBookingId?: string): Promise<Result<boolean>> {
    const rows = await tx`
      SELECT booking_id FROM bookings
      WHERE provider_id = ${providerId}::uuid
        AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
        AND start_time < ${endTime}::timestamptz
        AND end_time > ${startTime}::timestamptz
        ${ignoreBookingId ? tx`AND booking_id != ${ignoreBookingId}::uuid` : tx``}
      LIMIT 1
    `;
    return rows[0] ? [new Error('horario_ocupado'), null] : [null, false];
  },

  async insertBooking(tx: DB, data: {
    tenantId: string;
    clientId: string;
    serviceId: string;
    startTime: string;
    endTime: string;
    idempotencyKey: string;
    rescheduledFrom?: string;
  }): Promise<Result<{ booking_id: string; status: string }>> {
    const rows = await tx<{ booking_id: string; status: string }[]>`
      INSERT INTO bookings (
        provider_id, client_id, service_id, start_time, end_time,
        status, idempotency_key, rescheduled_from, gcal_sync_status
      ) VALUES (
        ${data.tenantId}::uuid, ${data.clientId}::uuid, ${data.serviceId}::uuid,
        ${data.startTime}, ${data.endTime},
        'pendiente', ${data.idempotencyKey}, ${data.rescheduledFrom ?? null}::uuid, 'pending'
      )
      ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
      RETURNING booking_id, status
    `;
    return rows[0] ? [null, rows[0]] : [new Error('error_insercion_booking'), null];
  },

  async updateBookingStatus(tx: DB, bookingId: string, status: string, reason?: string): Promise<Result<boolean>> {
    const rows = await tx`
      UPDATE bookings SET
        status = ${status},
        cancellation_reason = ${reason ?? null},
        updated_at = NOW()
      WHERE booking_id = ${bookingId}::uuid
      RETURNING booking_id
    `;
    return rows[0] ? [null, true] : [new Error('error_actualizacion_booking'), null];
  },

  async getBooking(tx: DB, bookingId: string): Promise<Result<{ status: string; client_id: string; service_id: string }>> {
    const rows = await tx<{ status: string; client_id: string; service_id: string }[]>`
      SELECT status, client_id, service_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
    `;
    return rows[0] ? [null, rows[0]] : [new Error('cita_no_encontrada'), null];
  },
} as const;

// ============================================================================
// SERVICE — Domain Orchestration & Business Logic
// ============================================================================

const Service = {
  async crear(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>> {
    const { service_id, start_time } = input;
    if (!service_id || !start_time) return [new Error('datos_insuficientes_crear'), null];

    // Concurrency: Lock provider
    const [lockErr] = await Repository.lockProvider(tx, tenantId);
    if (lockErr) return [lockErr, null];

    // Time calculations
    const [durErr, duration] = await Repository.getServiceDuration(tx, service_id);
    if (durErr || duration === null) return [durErr ?? new Error('servicio_no_encontrado'), null];

    const [timeErr, endTime] = Utils.calculateEndTime(start_time, duration);
    if (timeErr || !endTime) return [timeErr ?? new Error('error_tiempo'), null];

    // Conflict detection
    const [overlapErr] = await Repository.checkOverlap(tx, tenantId, start_time, endTime);
    if (overlapErr) return [overlapErr, null];

    const idempotencyKey = input.idempotency_key ?? Utils.deriveIdempotencyKey('crear', [tenantId, clientId, service_id, start_time]);

    const [insErr, booking] = await Repository.insertBooking(tx, {
      tenantId, clientId, serviceId: service_id, startTime: start_time, endTime, idempotencyKey
    });
    if (insErr || !booking) return [insErr ?? new Error('error_creacion'), null];

    return [null, { ...booking, message: 'Cita creada exitosamente' }];
  },

  async cancelar(tx: DB, clientId: string, input: Input): Promise<Result<BookingResult>> {
    const { booking_id, cancellation_reason } = input;
    if (!booking_id) return [new Error('booking_id_requerido'), null];

    const [getErr, booking] = await Repository.getBooking(tx, booking_id);
    if (getErr || !booking) return [getErr ?? new Error('cita_no_encontrada'), null];
    if (booking.client_id !== clientId) return [new Error('permiso_denegado_cita'), null];
    if (!['pendiente', 'confirmada'].includes(booking.status)) return [new Error(`estado_invalido_cancelar: ${booking.status}`), null];

    const [updErr] = await Repository.updateBookingStatus(tx, booking_id, 'cancelada', cancellation_reason);
    if (updErr) return [updErr, null];

    return [null, { booking_id, status: 'cancelada', message: 'Cita cancelada exitosamente' }];
  },

  async reagendar(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>> {
    const { booking_id, start_time } = input;
    if (!booking_id || !start_time) return [new Error('datos_insuficientes_reagendar'), null];

    const [getErr, old] = await Repository.getBooking(tx, booking_id);
    if (getErr || !old) return [getErr ?? new Error('cita_no_encontrada'), null];
    if (old.client_id !== clientId) return [new Error('permiso_denegado_cita'), null];
    if (!['pendiente', 'confirmada'].includes(old.status)) return [new Error('estado_invalido_reagendar'), null];

    // Concurrency: Lock provider
    await Repository.lockProvider(tx, tenantId);

    const [durErr, duration] = await Repository.getServiceDuration(tx, old.service_id);
    if (durErr || duration === null) return [durErr ?? new Error('servicio_no_encontrado'), null];

    const [timeErr, endTime] = Utils.calculateEndTime(start_time, duration);
    if (timeErr || !endTime) return [timeErr ?? new Error('error_tiempo'), null];

    // Overlap check
    const [overlapErr] = await Repository.checkOverlap(tx, tenantId, start_time, endTime, booking_id);
    if (overlapErr) return [overlapErr, null];

    const idempotencyKey = input.idempotency_key ?? Utils.deriveIdempotencyKey('reagendar', [booking_id, start_time]);

    const [insErr, booking] = await Repository.insertBooking(tx, {
      tenantId, clientId, serviceId: old.service_id, startTime: start_time, endTime, idempotencyKey, rescheduledFrom: booking_id
    });
    if (insErr || !booking) return [insErr ?? new Error('error_reagendar'), null];

    await Repository.updateBookingStatus(tx, booking_id, 'reagendada');

    return [null, { ...booking, message: 'Cita reagendada exitosamente' }];
  },
} as const;

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<BookingResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return [new Error(`error_validacion: ${parsed.error.message}`), null];

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('configuracion_db_faltante'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    const input = parsed.data;

    // 1. Resolve Tenant Context
    let tenantId: string;
    if (input.action === 'crear') {
      if (!input.provider_id) return [new Error('provider_id_requerido'), null];
      tenantId = input.provider_id;
    } else {
      if (!input.booking_id) return [new Error('booking_id_requerido'), null];
      const [err, resolved] = await Repository.resolveTenantForBooking(sql, input.booking_id);
      if (err || !resolved) return [err ?? new Error('resolucion_tenant_fallida'), null];
      tenantId = resolved;
    }

    // 2. Execute within Tenant Isolation Context (RLS)
    return await withTenantContext(sql, tenantId, async (tx) => {
      const [clientErr, clientId] = await Repository.resolveClientId(tx, input.user_id);
      if (clientErr || !clientId) return [clientErr ?? new Error('resolucion_cliente_fallida'), null];

      switch (input.action) {
        case 'crear':     return Service.crear(tx, tenantId, clientId, input);
        case 'cancelar':  return Service.cancelar(tx, clientId, input);
        case 'reagendar': return Service.reagendar(tx, tenantId, clientId, input);
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
