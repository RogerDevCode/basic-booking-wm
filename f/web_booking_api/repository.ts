import type { Result } from '../internal/result/index';
import type { DB } from './types';

export async function resolveTenantForBooking(sql: DB, bookingId: string): Promise<Result<string>> {
  try {
    const rows = await sql<readonly { provider_id: string }[]>`
      SELECT provider_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
    `;
    return rows[0] ? [null, rows[0].provider_id] : [new Error('cita_no_encontrada'), null];
  } catch (e) {
    return [new Error(`error_db_resolucion_tenant: ${String(e)}`), null];
  }
}

export async function resolveClientId(tx: DB, userId: string): Promise<Result<string>> {
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
}

export async function lockProvider(tx: DB, providerId: string): Promise<Result<boolean>> {
  const rows = await tx`SELECT provider_id FROM providers WHERE provider_id = ${providerId}::uuid AND is_active = true FOR UPDATE`;
  return rows[0] ? [null, true] : [new Error('proveedor_inactivo'), null];
}

export async function getServiceDuration(tx: DB, serviceId: string): Promise<Result<number>> {
  const rows = await tx<{ duration_minutes: number }[]>`SELECT duration_minutes FROM services WHERE service_id = ${serviceId}::uuid LIMIT 1`;
  return rows[0] ? [null, rows[0].duration_minutes] : [new Error('servicio_no_encontrado'), null];
}

export async function checkOverlap(tx: DB, providerId: string, startTime: string, endTime: string, ignoreBookingId?: string): Promise<Result<boolean>> {
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
}

export async function insertBooking(tx: DB, data: {
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
}

export async function updateBookingStatus(tx: DB, bookingId: string, status: string, reason?: string): Promise<Result<boolean>> {
  const rows = await tx`
    UPDATE bookings SET
      status = ${status},
      cancellation_reason = ${reason ?? null},
      updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
    RETURNING booking_id
  `;
  return rows[0] ? [null, true] : [new Error('error_actualizacion_booking'), null];
}

export async function getBooking(tx: DB, bookingId: string): Promise<Result<{ status: string; client_id: string; service_id: string }>> {
  const rows = await tx<{ status: string; client_id: string; service_id: string }[]>`
    SELECT status, client_id, service_id FROM bookings WHERE booking_id = ${bookingId}::uuid LIMIT 1
  `;
  return rows[0] ? [null, rows[0]] : [new Error('cita_no_encontrada'), null];
}
