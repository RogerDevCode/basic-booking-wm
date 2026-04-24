import type { WizardState, StepView } from './types.ts';
import { DateUtils } from './DateUtils.ts';

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
