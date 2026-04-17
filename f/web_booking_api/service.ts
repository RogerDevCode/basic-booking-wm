import type { Result } from '../internal/result';
import type { BookingResult, DB, Input } from './types';
import * as Repository from './repository';
import * as Utils from './utils';

export async function crear(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>> {
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
}

export async function cancelar(tx: DB, clientId: string, input: Input): Promise<Result<BookingResult>> {
  const { booking_id, cancellation_reason } = input;
  if (!booking_id) return [new Error('booking_id_requerido'), null];

  const [getErr, booking] = await Repository.getBooking(tx, booking_id);
  if (getErr || !booking) return [getErr ?? new Error('cita_no_encontrada'), null];
  if (booking.client_id !== clientId) return [new Error('permiso_denegado_cita'), null];
  if (!['pendiente', 'confirmada'].includes(booking.status)) return [new Error(`estado_invalido_cancelar: ${booking.status}`), null];

  const [updErr] = await Repository.updateBookingStatus(tx, booking_id, 'cancelada', cancellation_reason);
  if (updErr) return [updErr, null];

  return [null, { booking_id, status: 'cancelada', message: 'Cita cancelada exitosamente' }];
}

export async function reagendar(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>> {
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
}
