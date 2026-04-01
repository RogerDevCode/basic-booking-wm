// ============================================================================
// BOOKING WIZARD — Multi-step Appointment Booking Flow
// ============================================================================
// Single provider + single service booking wizard.
// Steps: date → time → confirm → done
// State is passed between invocations via wizard_state parameter.
// ============================================================================

import { z } from 'zod';
import * as postgres from 'postgres';

const WizardStateSchema = z.object({
  step: z.number(),
  patient_id: z.string(),
  chat_id: z.string(),
  selected_date: z.string().nullable(),
  selected_time: z.string().nullable(),
});

type WizardState = z.infer<typeof WizardStateSchema>;

const InputSchema = z.object({
  action: z.enum(['start', 'select_date', 'select_time', 'confirm', 'cancel', 'back']),
  wizard_state: z.record(z.string(), z.unknown()).optional(),
  user_input: z.string().optional(),
  provider_id: z.string().optional(),
  service_id: z.string().optional(),
  timezone: z.string().optional().default('America/Argentina/Buenos_Aires'),
});

function formatDate(dateStr: string, tz: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function getWeekDates(offset: number): { date: string; label: string; dayName: string }[] {
  const dates: { date: string; label: string; dayName: string }[] = [];
  const today = new Date();
  today.setDate(today.getDate() + offset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('es-AR', { weekday: 'short' });
    const label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    dates.push({ date: dateStr, label, dayName });
  }
  return dates;
}

function generateTimeSlots(startHour: number, endHour: number, durationMin: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += durationMin) {
      const hour = h.toString().padStart(2, '0');
      const min = m.toString().padStart(2, '0');
      slots.push(`${hour}:${min}`);
    }
  }
  return slots;
}

async function getAvailableSlots(
  sql: postgres.Sql,
  providerId: string,
  dateStr: string
): Promise<string[]> {
  const booked = await sql<{ start_time: string }[]>`
    SELECT start_time FROM bookings
    WHERE provider_id = ${providerId}::uuid
      AND DATE(start_time) = ${dateStr}::date
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
  `;

  const bookedTimes = new Set(booked.map(r => {
    const d = new Date(r.start_time);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }));

  return generateTimeSlots(8, 18, 30).filter(t => !bookedTimes.has(t));
}

function buildDateSelection(state: WizardState, weekOffset: number): { message: string; reply_keyboard: string[][]; new_state: WizardState } {
  const dates = getWeekDates(weekOffset);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset);
  const weekLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const keyboard: string[][] = [];
  for (let i = 0; i < dates.length; i += 2) {
    if (i + 1 < dates.length) {
      keyboard.push([`${dates[i].dayName} ${dates[i].label}`, `${dates[i + 1].dayName} ${dates[i + 1].label}`]);
    } else {
      keyboard.push([`${dates[i].dayName} ${dates[i].label}`]);
    }
  }

  const navRow = weekOffset > 0 ? ['« Semana anterior', 'Semana siguiente »'] : ['Semana siguiente »'];
  keyboard.push(navRow);
  keyboard.push(['❌ Cancelar']);

  return {
    message: `📅 *Elige una fecha*\n\nSemana del ${weekLabel}:\n(Toca el día que prefieras)`,
    reply_keyboard: keyboard,
    new_state: { ...state, step: 1 },
  };
}

function buildTimeSelection(state: WizardState, availableSlots: string[]): { message: string; reply_keyboard: string[][]; new_state: WizardState } {
  const keyboard: string[][] = [];
  for (let i = 0; i < availableSlots.length; i += 3) {
    keyboard.push(availableSlots.slice(i, i + 3));
  }
  keyboard.push(['« Volver a fechas', '❌ Cancelar']);

  const dateLabel = state.selected_date ? formatDate(state.selected_date, 'America/Argentina/Buenos_Aires') : 'fecha seleccionada';

  return {
    message: `🕐 *Elige un horario*\n\nPara el ${dateLabel}:\n(Horarios disponibles de 30 min)`,
    reply_keyboard: keyboard,
    new_state: { ...state, step: 2 },
  };
}

function buildConfirmation(state: WizardState): { message: string; reply_keyboard: string[][]; new_state: WizardState } {
  const dateLabel = state.selected_date ? formatDate(state.selected_date, 'America/Argentina/Buenos_Aires') : 'Por confirmar';

  return {
    message: `✅ *Confirma tu cita*\n\n📅 Fecha: ${dateLabel}\n🕐 Hora: ${state.selected_time ?? 'Por confirmar'}\n👨‍⚕️ Doctor: Tu doctor\n📋 Servicio: Consulta General (30 min)\n\n¿Confirmas estos detalles?`,
    reply_keyboard: [['✅ Confirmar', '🔄 Cambiar hora'], ['« Volver a fechas', '❌ Cancelar']],
    new_state: { ...state, step: 3 },
  };
}

function parseDateFromInput(input: string): string | null {
  const lower = input.toLowerCase();
  const dates = getWeekDates(0).concat(getWeekDates(7));
  for (const d of dates) {
    if (lower.includes(d.label.toLowerCase()) || lower.includes(d.date)) {
      return d.date;
    }
  }
  return null;
}

function parseTimeFromInput(input: string): string | null {
  const match = input.match(/(\d{1,2}):?(\d{2})?/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }
  return null;
}

export async function main(rawInput: unknown): Promise<{ success: boolean; data: unknown | null; error_message: string | null }> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { action, wizard_state, user_input, provider_id, service_id, timezone } = parsed.data;

    let state: WizardState;
    if (wizard_state && Object.keys(wizard_state).length > 0) {
      state = WizardStateSchema.parse(wizard_state);
    } else {
      state = { step: 0, patient_id: '', chat_id: '', selected_date: null, selected_time: null };
    }

    const dbUrl = process.env['DATABASE_URL'];
    const sql = dbUrl ? postgres(dbUrl, { ssl: 'require' }) : null;

    let message = '';
    let reply_keyboard: string[][] | undefined;
    let force_reply = false;
    let reply_placeholder = '';

    switch (action) {
      case 'start':
        state.step = 1;
        state.chat_id = wizard_state?.chat_id as string ?? '';
        state.patient_id = wizard_state?.patient_id as string ?? '';
        ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
        break;

      case 'select_date': {
        if (user_input) {
          const dateStr = parseDateFromInput(user_input);
          if (dateStr) {
            state.selected_date = dateStr;
          }
        }
        if (!state.selected_date && user_input) {
          const dates = getWeekDates(0).concat(getWeekDates(7));
          for (const d of dates) {
            if (user_input.toLowerCase().includes(d.dayName.toLowerCase())) {
              state.selected_date = d.date;
              break;
            }
          }
        }
        if (!state.selected_date) {
          ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
          break;
        }

        const slots = sql && provider_id
          ? await getAvailableSlots(sql, provider_id, state.selected_date)
          : generateTimeSlots(8, 18, 30);

        if (slots.length === 0) {
          message = `😅 No hay horarios disponibles para el ${formatDate(state.selected_date, timezone)}.\n\nElige otra fecha:`;
          state.selected_date = null;
          ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
        } else {
          ({ message, reply_keyboard, new_state: state } = buildTimeSelection(state, slots));
        }
        break;
      }

      case 'select_time': {
        if (user_input) {
          const timeStr = parseTimeFromInput(user_input);
          if (timeStr) {
            state.selected_time = timeStr;
          }
        }
        if (!state.selected_time && user_input) {
          state.selected_time = user_input.trim();
        }
        if (!state.selected_time) {
          message = '⚠️ Por favor selecciona un horario o escribe la hora (ej: 10:00).';
          force_reply = true;
          reply_placeholder = 'Escribe la hora (ej: 10:00)';
          reply_keyboard = [['« Volver a fechas', '❌ Cancelar']];
          break;
        }
        ({ message, reply_keyboard, new_state: state } = buildConfirmation(state));
        break;
      }

      case 'confirm': {
        if (!state.selected_date || !state.selected_time) {
          message = '⚠️ Falta seleccionar fecha u hora. Volviendo al inicio del wizard.';
          state.step = 1;
          state.selected_date = null;
          state.selected_time = null;
          ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
          break;
        }

        message = `🎉 *¡Cita Agendada!*\n\n✅ Tu cita ha sido reservada:\n📅 ${formatDate(state.selected_date, timezone)}\n🕐 ${state.selected_time}\n👨‍⚕️ Tu doctor\n📋 Consulta General\n\nRecibirás recordatorios 24h, 2h y 30min antes.\n\n¿Necesitas algo más?`;
        reply_keyboard = [['📅 Agendar otra', '📋 Mis citas'], ['🔔 Recordatorios', '❓ Información']];
        state.step = 99;
        break;
      }

      case 'back':
        if (state.step <= 1) {
          message = '📋 Menú principal. ¿En qué puedo ayudarte?';
          reply_keyboard = [['📅 Agendar cita', '📋 Mis citas'], ['🔔 Recordatorios', '❓ Información']];
          state.step = 0;
        } else if (state.step === 2) {
          state.selected_date = null;
          ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
        } else if (state.step === 3) {
          state.selected_time = null;
          const slots = sql && provider_id && state.selected_date
            ? await getAvailableSlots(sql, provider_id, state.selected_date)
            : generateTimeSlots(8, 18, 30);
          ({ message, reply_keyboard, new_state: state } = buildTimeSelection(state, slots));
        }
        break;

      case 'cancel':
        message = '❌ Agendamiento cancelado.\n\n¿En qué más puedo ayudarte?';
        reply_keyboard = [['📅 Agendar cita', '📋 Mis citas'], ['🔔 Recordatorios', '❓ Información']];
        state.step = 0;
        state.selected_date = null;
        state.selected_time = null;
        break;
    }

    if (sql) await sql.end();

    return {
      success: true,
      data: {
        message,
        reply_keyboard,
        force_reply,
        reply_placeholder,
        wizard_state: state,
        is_complete: state.step === 99,
      },
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}
