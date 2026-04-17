import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import type { Result } from '../internal/result';
import type { WizardState, StepView } from './types';

export const DateUtils = {
  format(dateStr: string, tz: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  },

  getWeekDates(offset: number): readonly { date: string; label: string; dayName: string }[] {
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
  },

  parseDate(input: string): string | null {
    const lower = input.toLowerCase();
    const dates = this.getWeekDates(0).concat(this.getWeekDates(7));
    for (const d of dates) {
      if (lower.includes(d.label.toLowerCase()) || lower.includes(d.date)) {
        return d.date;
      }
    }
    return null;
  },

  parseTime(input: string): string | null {
    const match = /(\d{1,2}):?(\d{2})?/.exec(input);
    if (match === null) return null;
    const hStr = match[1];
    if (hStr === undefined) return null;
    const h = parseInt(hStr, 10);
    if (Number.isNaN(h)) return null;
    const mStr = match[2];
    const m = mStr !== undefined ? parseInt(mStr, 10) : 0;
    if (Number.isNaN(m)) return null;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    return null;
  },

  generateTimeSlots(startHour: number, endHour: number, durationMin: number): readonly string[] {
    const slots: string[] = [];
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += durationMin) {
        const hour = h.toString().padStart(2, '0');
        const min = m.toString().padStart(2, '0');
        slots.push(`${hour}:${min}`);
      }
    }
    return slots;
  },
};

export class WizardRepository {
  constructor(private readonly sql: postgres.Sql, private readonly tenantId: string) {}

  async getServiceDuration(serviceId: string): Promise<Result<number>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const rows = await tx<{ duration_minutes: number }[]>`
        SELECT duration_minutes FROM services
        WHERE service_id = ${serviceId}::uuid AND is_active = true LIMIT 1
      `;
      const row = rows[0];
      if (row === undefined) {
        return [new Error(`service_not_found: ${serviceId}`), null];
      }
      return [null, row.duration_minutes];
    });
  }

  async getAvailableSlots(providerId: string, dateStr: string, durationMin: number): Promise<Result<readonly string[]>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const booked = await tx<{ start_time: Date }[]>`
        SELECT start_time FROM bookings
        WHERE provider_id = ${providerId}::uuid
          AND DATE(start_time) = ${dateStr}::date
          AND status NOT IN ('cancelada', 'no_presentado', 'reagendada')
      `;

      const bookedTimes = new Set(booked.map((row) => {
        const d = new Date(row.start_time);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }));

      const allSlots = DateUtils.generateTimeSlots(8, 18, durationMin);
      return [null, allSlots.filter((t) => !bookedTimes.has(t))];
    });
  }

  async getProviderAndServiceNames(providerId: string, serviceId: string): Promise<Result<{ provider: string; service: string }>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const pRows = await tx<{ name: string }[]>`SELECT name FROM providers WHERE provider_id = ${providerId}::uuid LIMIT 1`;
      const sRows = await tx<{ name: string }[]>`SELECT name FROM services WHERE service_id = ${serviceId}::uuid LIMIT 1`;

      const pRow = pRows[0];
      const sRow = sRows[0];

      if (pRow === undefined || sRow === undefined) {
        return [new Error('integrity_error: provider_or_service_not_found'), null];
      }
      return [null, { provider: pRow.name, service: sRow.name }];
    });
  }

  async createBooking(
    clientId: string,
    providerId: string,
    serviceId: string,
    dateStr: string,
    timeStr: string,
    timezone: string,
    durationMin: number
  ): Promise<Result<string>> {
    return withTenantContext(this.sql, this.tenantId, async (tx) => {
      const localTimestampStr = `${dateStr}T${timeStr}:00`;
      const idempotencyKey = `wizard-${clientId}-${providerId}-${serviceId}-${dateStr}-${timeStr}`;

      const bookingRows = await tx<{ booking_id: string }[]>`
        INSERT INTO bookings (
          client_id, provider_id, service_id, start_time, end_time,
          status, idempotency_key, gcal_sync_status
        ) VALUES (
          ${clientId}::uuid, ${providerId}::uuid, ${serviceId}::uuid,
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone}),
          (${localTimestampStr}::timestamp AT TIME ZONE ${timezone} + (${durationMin} * INTERVAL '1 minute')),
          'confirmada', ${idempotencyKey}, 'pending'
        )
        ON CONFLICT (idempotency_key)
        DO UPDATE SET updated_at = NOW()
        RETURNING booking_id
      `;

      const bookingRow = bookingRows[0];
      if (bookingRow === undefined) {
        return [new Error('insert_failed: no_booking_id_returned'), null];
      }

      await tx`
        INSERT INTO booking_audit (
          booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
        ) VALUES (
          ${bookingRow.booking_id}::uuid, null, 'confirmada', 'client',
          ${clientId}::uuid, 'Booking created via wizard', '{"channel": "telegram"}'::jsonb
        )
      `;

      return [null, bookingRow.booking_id];
    });
  }
}

export const WizardUI = {
  buildDateSelection(state: WizardState, weekOffset: number): StepView {
    const dates = DateUtils.getWeekDates(weekOffset);
    const today = new Date();
    today.setDate(today.getDate() + weekOffset);
    const weekLabel = today.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    const keyboard: string[][] = [];
    for (let i = 0; i < dates.length; i += 2) {
      const d0 = dates[i];
      const d1 = dates[i + 1];
      if (d0 !== undefined && d1 !== undefined) {
        keyboard.push([`${d0.dayName} ${d0.label}`, `${d1.dayName} ${d1.label}`]);
      } else if (d0 !== undefined) {
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
  },

  buildTimeSelection(state: WizardState, availableSlots: readonly string[], tz: string): StepView {
    const keyboard: string[][] = [];
    for (let i = 0; i < availableSlots.length; i += 3) {
      keyboard.push(Array.from(availableSlots.slice(i, i + 3)));
    }
    keyboard.push(['« Volver a fechas', '❌ Cancelar']);

    const dateLabel = state.selected_date !== null ? DateUtils.format(state.selected_date, tz) : 'fecha seleccionada';

    return {
      message: `🕐 *Elige un horario*\n\nPara el ${dateLabel}:\n(Horarios disponibles)`,
      reply_keyboard: keyboard,
      new_state: { ...state, step: 2 },
    };
  },

  buildConfirmation(state: WizardState, providerName: string, serviceName: string, tz: string): StepView {
    const dateLabel = state.selected_date !== null ? DateUtils.format(state.selected_date, tz) : 'Por confirmar';

    return {
      message: `✅ *Confirma tu cita*\n\n📅 Fecha: ${dateLabel}\n🕐 Hora: ${state.selected_time ?? 'Por confirmar'}\n👨‍⚕️ Doctor: ${providerName}\n📋 Servicio: ${serviceName}\n\n¿Confirmas estos detalles?`,
      reply_keyboard: [['✅ Confirmar', '🔄 Cambiar hora'], ['« Volver a fechas', '❌ Cancelar']],
      new_state: { ...state, step: 3 },
    };
  },
};