import { DateUtils } from '../DateUtils';
import { WizardUI } from '../WizardUI';
import type { ActionContext, ActionHandler, StepView } from '../types';

export class ConfirmHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const { input, state, repo, serviceDurationMin } = context;

    if (state.selected_date === null || state.selected_time === null || input.provider_id === undefined || input.service_id === undefined) {
      const baseView = WizardUI.buildDateSelection({ ...state, selected_date: null, selected_time: null }, 0);
      const view: StepView = { ...baseView, message: `⚠️ Faltan datos críticos.\n\n${baseView.message}` };
      return [null, view];
    } else {
      const [err, bookingId] = await repo.createBooking(state.client_id, input.provider_id, input.service_id, state.selected_date, state.selected_time, input.timezone, serviceDurationMin);
      if (err !== null) {
        const view: StepView = {
          message: `❌ Error al agendar: ${err.message}. Intenta con otro horario.`,
          reply_keyboard: [['📅 Agendar otra', '📋 Mis citas']],
          new_state: { ...state, step: 0, selected_date: null, selected_time: null },
        };
        return [null, view];
      } else {
        const [_namesErr, names] = await repo.getProviderAndServiceNames(input.provider_id, input.service_id);
        const providerName = names?.provider ?? 'Profesional';
        const serviceName = names?.service ?? 'Servicio';

        const view: StepView = {
          message: `🎉 *¡Cita Agendada!*\n\n🆔 ID: \`${bookingId ?? ''}\`\n📅 Fecha: ${DateUtils.format(state.selected_date, input.timezone)}\n🕐 Hora: ${state.selected_time}\n👨‍⚕️ Profesional: ${providerName}\n📋 Servicio: ${serviceName}\n\nTu cita ha sido registrada exitosamente.`,
          reply_keyboard: [['📅 Agendar otra', '📋 Mis citas']],
          new_state: { ...state, step: 99 },
        };
        return [null, view];
      }
    }
  }
}
