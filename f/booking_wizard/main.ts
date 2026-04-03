// ============================================================================
// BOOKING WIZARD — Multi-step Appointment Booking Flow (v3.1)
// Pattern: Precision Architecture, Errors as Values, Immutability
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const WizardStateSchema = z.object({
  step: z.number().int().min(0),
  patient_id: z.string().min(1),
  chat_id: z.string().min(1),
  selected_date: z.string().nullable(),
  selected_time: z.string().nullable(),
}).readonly();

type WizardState = Readonly<z.infer<typeof WizardStateSchema>>;

const InputSchema = z.object({
  action: z.enum(['start', 'select_date', 'select_time', 'confirm', 'cancel', 'back']),
  wizard_state: z.record(z.string(), z.unknown()).optional(),
  user_input: z.string().optional(),
  provider_id: z.string().optional(),
  service_id: z.string().optional(),
  timezone: z.string().optional().default('America/Argentina/Buenos_Aires'),
}).readonly();

function formatDate(dateStr: string, tz: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function getWeekDates(offset: number): readonly { readonly date: string; readonly label: string; readonly dayName: string }[] {
  const dates: { date: string; label: string; dayName: string }[] = [];
  const today = new Date();
  today.setDate(today.getDate() + offset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString();
    const dateStr = iso.split('T')[0] ?? iso.slice(0, 10);
    const dayName = d.toLocaleDateString('es-AR', { weekday: 'short' });
    const label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    dates.push({ date: dateStr, label, dayName });
  }
  return dates;
}

function generateTimeSlots(startHour: number, endHour: number, durationMin: number): readonly string[] {
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
  dateStr: string,
  durationMin: number
): Promise<readonly string[]> {
  interface BookedRow { readonly start_time: Date }
  const booked = await sql<readonly BookedRow[]>`
    SELECT start_time FROM bookings
    WHERE provider_id = ${providerId}::uuid
      AND DATE(start_time) = ${dateStr}::date
      AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
  `;

  const bookedTimes = new Set(booked.map((r) => {
    const d = r.start_time;
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }));

  return generateTimeSlots(8, 18, durationMin).filter((t: string) => !bookedTimes.has(t));
}

interface StepView {
  readonly message: string;
  readonly reply_keyboard: readonly (readonly string[])[];
  readonly new_state: WizardState;
}

function buildDateSelection(state: WizardState, weekOffset: number): StepView {
  const dates = getWeekDates(weekOffset);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset);
  const weekLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const keyboard: string[][] = [];
  for (let i = 0; i < dates.length; i += 2) {
    const d0 = dates[i];
    const d1 = dates[i + 1];
    if (d0 != null && d1 != null) {
      keyboard.push([`${d0.dayName} ${d0.label}`, `${d1.dayName} ${d1.label}`]);
    } else if (d0 != null) {
      keyboard.push([`${d0.dayName} ${d0.label}`]);
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

function buildTimeSelection(state: WizardState, availableSlots: readonly string[]): StepView {
  const keyboard: string[][] = [];
  for (let i = 0; i < availableSlots.length; i += 3) {
    keyboard.push(Array.from(availableSlots.slice(i, i + 3)));
  }
  keyboard.push(['« Volver a fechas', '❌ Cancelar']);

  const dateLabel = state.selected_date != null ? formatDate(state.selected_date, 'America/Argentina/Buenos_Aires') : 'fecha seleccionada';

  return {
    message: `🕐 *Elige un horario*\n\nPara el ${dateLabel}:\n(Horarios disponibles)`,
    reply_keyboard: keyboard,
    new_state: { ...state, step: 2 },
  };
}

function buildConfirmation(state: WizardState, providerName: string, serviceName: string): StepView {
  const dateLabel = state.selected_date != null ? formatDate(state.selected_date, 'America/Argentina/Buenos_Aires') : 'Por confirmar';

  return {
    message: `✅ *Confirma tu cita*\n\n📅 Fecha: ${dateLabel}\n🕐 Hora: ${state.selected_time ?? 'Por confirmar'}\n👨‍⚕️ Doctor: ${providerName}\n📋 Servicio: ${serviceName}\n\n¿Confirmas estos detalles?`,
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
  const match = /(\d{1,2}):?(\d{2})?/.exec(input);
  if (match != null) {
    const hStr = match[1];
    if (hStr == null) return null;
    const h = parseInt(hStr, 10);
    const mStr = match[2];
    const m = mStr !== undefined ? parseInt(mStr, 10) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }
  return null;
}

async function createBookingInDB(
  sql: postgres.Sql,
  patientId: string,
  providerId: string,
  serviceId: string,
  dateStr: string,
  timeStr: string,
  timezone: string
): Promise<[Error | null, string | null]> {
  try {
    const localTimestampStr = `${dateStr}T${timeStr}:00`;
    const idempotencyKey = `wizard-${patientId}-${providerId}-${serviceId}-${dateStr}-${timeStr}`;

    const bookingId = await sql.begin(async (tx) => {
      const q = tx as unknown as postgres.Sql;
      interface SvcDurRow { readonly duration_minutes: number }
      const [service] = await q<readonly SvcDurRow[]>`
        SELECT duration_minutes FROM services
        WHERE service_id = ${serviceId}::uuid AND is_active = true LIMIT 1
      `;
      const durationMin: number = service?.duration_minutes ?? 30;

      interface BookingIdRow { readonly booking_id: string }
      const [booking] = await q<readonly BookingIdRow[]>`
        INSERT INTO bookings (
          patient_id, provider_id, service_id, start_time, end_time,
          status, idempotency_key, gcal_sync_status, notification_sent,
          reminder_24h_sent, reminder_2h_sent, reminder_30min_sent
        ) VALUES (
          ${patientId}::uuid, ${providerId}::uuid, ${serviceId}::uuid,
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone}),
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone} + (${durationMin} * INTERVAL '1 minute')),
          'confirmed', ${idempotencyKey}, 'pending', false, false, false, false
        )
        ON CONFLICT (idempotency_key)
        DO UPDATE SET updated_at = NOW(), status = EXCLUDED.status
        RETURNING booking_id
      `;

      if (booking == null) return null;

      await q`
        INSERT INTO booking_audit (
          booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
        ) VALUES (
          ${booking.booking_id}::uuid, null, 'confirmed', 'patient',
          ${patientId}::uuid, 'Booking created via wizard', '{"channel": "telegram"}'::jsonb
        )
      `;

      return booking.booking_id;
    });

    if (bookingId == null) return [new Error("Failed to insert booking"), null];
    return [null, bookingId];
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return [err, null];
  }
}

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: Record<string, unknown> | null; readonly error_message: string | null }> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Invalid input: ${parsed.error.message}` };
    }

    const { action, wizard_state, user_input, provider_id, service_id, timezone } = parsed.data;

    let state: WizardState;
    if (wizard_state != null && Object.keys(wizard_state).length > 0) {
      const stateResult = WizardStateSchema.safeParse(wizard_state);
      state = stateResult.success ? stateResult.data : { step: 0, patient_id: '', chat_id: '', selected_date: null, selected_time: null };
    } else {
      state = { step: 0, patient_id: '', chat_id: '', selected_date: null, selected_time: null };
    }

    const dbUrl = process.env['DATABASE_URL'];
    if (dbUrl == null) {
      return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required.' };
    }
    const sql = postgres(dbUrl, { ssl: 'require' });

    let serviceDurationMin = 30;
    if (service_id != null) {
      interface SvcRow { readonly duration_minutes: number }
      const [svc] = await sql<readonly SvcRow[]>`
        SELECT duration_minutes FROM services WHERE service_id = ${service_id}::uuid AND is_active = true LIMIT 1
      `;
      if (svc == null) {
        await sql.end();
        return { success: false, data: null, error_message: `Service ${service_id} not found.` };
      }
      serviceDurationMin = svc.duration_minutes;
    }

    let message = '';
    let reply_keyboard: readonly (readonly string[])[] | undefined;
    let force_reply = false;
    let reply_placeholder = '';

    switch (action) {
      case 'start':
        state = { ...state, step: 1, chat_id: typeof wizard_state?.['chat_id'] === 'string' ? wizard_state['chat_id'] : '', patient_id: typeof wizard_state?.['patient_id'] === 'string' ? wizard_state['patient_id'] : '' };
        ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
        break;

      case 'select_date': {
        if (user_input != null) {
          const dateStr = parseDateFromInput(user_input);
          if (dateStr != null) {
            state = { ...state, selected_date: dateStr };
          } else {
            const dates = getWeekDates(0).concat(getWeekDates(7));
            for (const d of dates) {
              if (user_input.toLowerCase().includes(d.dayName.toLowerCase())) {
                state = { ...state, selected_date: d.date };
                break;
              }
            }
          }
        }
        if (state.selected_date == null) {
          ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
        } else {
          const slots = provider_id != null
            ? await getAvailableSlots(sql, provider_id, state.selected_date, serviceDurationMin)
            : generateTimeSlots(8, 18, serviceDurationMin);

          if (slots.length === 0) {
            message = `😅 No hay horarios para el ${formatDate(state.selected_date, timezone)}.\n\nElige otro:`;
            state = { ...state, selected_date: null };
            ({ message, reply_keyboard, new_state: state } = buildDateSelection(state, 0));
          } else {
            ({ message, reply_keyboard, new_state: state } = buildTimeSelection(state, slots));
          }
        }
        break;
      }

      case 'select_time': {
        if (user_input != null) {
          const timeStr = parseTimeFromInput(user_input);
          if (timeStr != null) {
            state = { ...state, selected_time: timeStr };
          } else {
            state = { ...state, selected_time: user_input.trim() };
          }
        }
        if (state.selected_time == null) {
          message = '⚠️ Selecciona un horario o escribe la hora (ej: 10:00).';
          force_reply = true;
          reply_placeholder = 'Escribe la hora (ej: 10:00)';
          reply_keyboard = [['« Volver a fechas', '❌ Cancelar']];
        } else {
          let providerName = 'Tu doctor';
          let serviceName = 'Consulta';
          if (provider_id != null) {
            const [p] = await sql<readonly { name: string }[]>`SELECT name FROM providers WHERE provider_id = ${provider_id}::uuid LIMIT 1`;
            if (p != null) providerName = p.name;
          }
          if (service_id != null) {
            const [s] = await sql<readonly { name: string }[]>`SELECT name FROM services WHERE service_id = ${service_id}::uuid LIMIT 1`;
            if (s != null) serviceName = s.name;
          }
          ({ message, reply_keyboard, new_state: state } = buildConfirmation(state, providerName, serviceName));
        }
        break;
      }

      case 'confirm': {
        if (state.selected_date == null || state.selected_time == null || provider_id == null || service_id == null) {
          message = '⚠️ Faltan datos. Reiniciando...';
          ({ message, reply_keyboard, new_state: state } = buildDateSelection({ ...state, selected_date: null, selected_time: null }, 0));
        } else {
          const [err, bookingId] = await createBookingInDB(sql, state.patient_id, provider_id, service_id, state.selected_date, state.selected_time, timezone);
          if (err != null) {
            message = `❌ Error: ${err.message}. Intenta otro horario.`;
            reply_keyboard = [['📅 Agendar otra', '📋 Mis citas']];
            state = { ...state, step: 0, selected_date: null, selected_time: null };
          } else {
            message = `🎉 *¡Cita Agendada!*\n\n🆔 ID: \`${bookingId ?? ''}\`.\n\n📅 ${formatDate(state.selected_date, timezone)}\n🕐 ${state.selected_time}`;
            reply_keyboard = [['📅 Agendar otra', '📋 Mis citas']];
            state = { ...state, step: 99 };
          }
        }
        break;
      }

      case 'back':
        if (state.step <= 1) {
          message = '📋 Menú principal.';
          reply_keyboard = [['📅 Agendar cita', '📋 Mis citas']];
          state = { ...state, step: 0 };
        } else if (state.step === 2) {
          ({ message, reply_keyboard, new_state: state } = buildDateSelection({ ...state, selected_date: null }, 0));
        } else if (state.step === 3) {
          const slots = provider_id != null && state.selected_date != null
            ? await getAvailableSlots(sql, provider_id, state.selected_date, serviceDurationMin)
            : generateTimeSlots(8, 18, serviceDurationMin);
          ({ message, reply_keyboard, new_state: state } = buildTimeSelection({ ...state, selected_time: null }, slots));
        }
        break;

      case 'cancel':
        message = '❌ Cancelado.';
        reply_keyboard = [['📅 Agendar cita', '📋 Mis citas']];
        state = { ...state, step: 0, selected_date: null, selected_time: null };
        break;
    }

    await sql.end();

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
