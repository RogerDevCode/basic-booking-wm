import type { Result } from '../internal/result/index';
import type { InputType, OrchestratorResult } from './types';
import { getEntity } from './getEntity';
import { main as createBooking } from '../booking_create/main';

export async function handleCreateBooking(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { client_id, provider_id, service_id, date, time } = input;

  // 1. SMART HANDOFF: Detect missing required fields for a direct booking
  if (!client_id || !provider_id || !service_id || !date || !time) {
    let nextStep: 'selecting_specialty' | 'selecting_doctor' | 'selecting_date' | 'selecting_time' = 'selecting_specialty';
    
    if (provider_id && !date) {
      nextStep = 'selecting_date';
    } else if (service_id && !provider_id) {
      nextStep = 'selecting_doctor';
    } else if (date && !time) {
      nextStep = 'selecting_time';
    }

    return [null, {
      action: 'crear_cita',
      success: false,
      data: null,
      message: `He capturado parte de tu solicitud, pero para agendar necesito que completemos unos detalles en el asistente.`,
      nextState: { name: nextStep, error: null, items: [] },
      nextDraft: {
        specialty_id: null, // Should be resolved in context if possible
        specialty_name: getEntity(input.entities, 'specialty_name') ?? null,
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
