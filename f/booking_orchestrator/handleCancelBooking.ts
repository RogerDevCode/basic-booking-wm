import type { Result } from '../internal/result/index.ts';
import type { InputType, OrchestratorResult } from './types.ts';
import { getEntity } from './getEntity.ts';
import { handleGetMyBookings } from './handleGetMyBookings.ts';
import { main as cancelBooking } from '../booking_cancel/main.ts';

export async function handleCancelBooking(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const bookingId = input.booking_id ?? getEntity(input.entities, 'booking_id');

  if (!bookingId) {
    return handleGetMyBookings({
      ...input,
      notes: 'Por favor, dime el ID de la cita que deseas cancelar.'
    });
  }

  const [err, data] = await cancelBooking({
    booking_id: bookingId,
    actor: 'client',
    actor_id: input.client_id,
    reason: getEntity(input.entities, 'reason') ?? input.notes,
  });

  return [null, {
    action: 'cancelar_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo cancelar: ${err.message}` : '✅ Tu cita ha sido cancelada exitosamente.',
  }];
}
