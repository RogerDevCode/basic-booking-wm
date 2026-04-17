import type { Result } from '../internal/result';
import type { InputType, OrchestratorResult } from './types';
import { getEntity } from './getEntity';
import { handleGetMyBookings } from './handleGetMyBookings';

export async function handleReschedule(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');
  const { date, time } = input;

  if (!bookingId) {
    return handleGetMyBookings({
      ...input,
      notes: 'Dime el ID de la cita que quieres mover y la nueva fecha/hora.'
    });
  }

  if (!date || !time) {
    return [null, {
      action: 'reagendar_cita',
      success: false,
      data: null,
      message: 'Necesito la nueva fecha y hora para reagendar.',
      follow_up: '¿Para cuándo te gustaría moverla?',
      nextState: { name: 'selecting_time', specialtyId: '', doctorId: '', doctorName: '', targetDate: date ?? null, error: null, items: [] },
      nextDraft: {
        specialty_id: null, specialty_name: null,
        doctor_id: input.provider_id ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: null, time_label: null,
        client_id: input.client_id ?? null,
      }
    }];
  }

  const { main: rescheduleBooking } = await import('../booking_reschedule/main');
  const [err, data] = await rescheduleBooking({
    booking_id: bookingId,
    new_start_time: new Date(`${date}T${time}:00`).toISOString(),
    actor: 'client',
    actor_id: input.client_id,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  });

  return [null, {
    action: 'reagendar_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo reagendar: ${err.message}` : `✅ Reagendada para el ${date} a las ${time}.`,
  }];
}
