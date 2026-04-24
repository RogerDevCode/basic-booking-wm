import type { Result } from '../internal/result/index.ts';
import type { InputType, OrchestratorResult, AvailabilityData } from './types.ts';
import { main as checkAvailability } from '../availability_check/main.ts';

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

  const morningSlots = slots.filter(s => new Date(s.start).getHours() < 12);
  const afternoonSlots = slots.filter(s => new Date(s.start).getHours() >= 12);

  const format = (s: typeof slots[0]) => {
    const d = new Date(s.start);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  let message = `📅 *Disponibilidad para el ${date}:*\n\n`;
  
  if (morningSlots.length > 0) {
    message += `🌅 *Mañana:*\n${morningSlots.map(format).join(', ')}\n\n`;
  }
  
  if (afternoonSlots.length > 0) {
    message += `🌇 *Tarde:*\n${afternoonSlots.map(format).join(', ')}\n\n`;
  }

  return [null, {
    action: 'ver_disponibilidad', success: true, data,
    message,
    follow_up: '¿Te gustaría agendar alguno de estos horarios?'
  }];
}
