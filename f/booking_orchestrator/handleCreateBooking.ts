import type { Result } from '../internal/result/index';
import type { InputType, OrchestratorResult } from './types';
import { getEntity } from './getEntity';
import { main as createBooking } from '../booking_create/main';

export async function handleCreateBooking(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { client_id, provider_id, service_id, date, time } = input;

  if (!client_id || !provider_id || !service_id || !date || !time) {
    return [null, {
      action: 'crear_cita',
      success: false,
      data: null,
      message: 'Faltan datos para confirmar la cita. Vamos al asistente.',
      follow_up: '¿Continuamos?',
      nextState: { name: 'selecting_specialty', error: null, items: [] },
      nextDraft: {
        specialty_id: null, specialty_name: null,
        doctor_id: provider_id ?? null,
        doctor_name: getEntity(input.entities, 'provider_name') ?? null,
        target_date: date ?? null,
        start_time: time && date ? `${date}T${time}:00` : null,
        time_label: time ?? null,
        client_id: client_id ?? null,
      }
    }];
  }

  const startTime = new Date(`${date}T${time}:00`);
  const [err, data] = await createBooking({
    client_id,
    provider_id,
    service_id,
    start_time: startTime.toISOString(),
    idempotency_key: `orch-${client_id}-${provider_id}-${date}-${time}`,
    notes: input.notes,
    actor: 'client',
    channel: input.channel,
  });

  return [null, {
    action: 'crear_cita',
    success: !err,
    data,
    message: err ? `❌ No se pudo agendar: ${err.message}` : `✅ Cita agendada para el ${date} a las ${time}.`,
    follow_up: err ? '¿Quieres intentar otro horario?' : undefined,
  }];
}
