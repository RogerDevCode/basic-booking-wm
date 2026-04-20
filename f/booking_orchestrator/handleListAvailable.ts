import type { Result } from '../internal/result/index';
import type { InputType, OrchestratorResult, AvailabilityData } from './types';
import { main as checkAvailability } from '../availability_check/main';

export async function handleListAvailable(
  input: Readonly<InputType>
): Promise<Result<OrchestratorResult>> {
  const { provider_id, date, service_id } = input;

  if (!provider_id || !date) {
    return [null, {
      action: 'ver_disponibilidad',
      success: false,
      data: null,
      message: 'Necesito el doctor y la fecha para consultar disponibilidad.',
    }];
  }

  const [err, data] = await checkAvailability({
    provider_id,
    date,
    service_id,
  });

  if (err || !data) {
    return [null, {
      action: 'ver_disponibilidad', success: false, data: null,
      message: `❌ Error: ${err?.message ?? 'Desconocido'}`,
    }];
  }

  const avail = data as unknown as AvailabilityData;
  if (avail.is_blocked) {
    return [null, {
      action: 'ver_disponibilidad', success: true, data,
      message: `😅 No hay disponibilidad el ${date}: ${avail.block_reason ?? 'Motivo desconocido'}`,
    }];
  }

  const slots = avail.slots?.filter((s) => s.available).slice(0, 10);
  if (!slots || slots.length === 0) {
    return [null, {
      action: 'ver_disponibilidad', success: true, data,
      message: `😅 No hay horarios disponibles el ${date}.`,
    }];
  }

  const slotTimes = slots.map((s) => {
    const d = new Date(s.start);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }).join(', ');

  return [null, {
    action: 'ver_disponibilidad', success: true, data,
    message: `📅 Horarios disponibles el ${date}:\n${slotTimes}${avail.total_available > 10 ? '...' : ''}`,
  }];
}
