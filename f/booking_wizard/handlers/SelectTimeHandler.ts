import { DateUtils } from '../DateUtils';
import { WizardUI } from '../WizardUI';
import type { ActionContext, ActionHandler, StepView } from '../types';

export class SelectTimeHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const { input, state, repo } = context;
    const timeStr = input.user_input !== undefined ? DateUtils.parseTime(input.user_input) : null;
    const finalTime = timeStr ?? input.user_input?.trim() ?? state.selected_time;

    if (finalTime === null) {
      const view: StepView = {
        message: '⚠️ Por favor selecciona un horario o escribe la hora (ej: 10:00).',
        reply_keyboard: [['« Volver a fechas', '❌ Cancelar']],
        new_state: state,
        force_reply: true,
        reply_placeholder: 'Escribe la hora (ej: 10:00)',
      };
      return [null, view];
    } else if (input.provider_id === undefined || input.service_id === undefined) {
      const view: StepView = {
        message: '⚠️ Faltan datos del profesional o servicio.',
        reply_keyboard: [['❌ Cancelar']],
        new_state: state,
      };
      return [null, view];
    } else {
      const [err, names] = await repo.getProviderAndServiceNames(input.provider_id, input.service_id);
      if (err !== null || names === null) {
        const view: StepView = {
          message: '⚠️ No se pudo recuperar la información necesaria. Reintenta.',
          reply_keyboard: [['« Volver a fechas', '❌ Cancelar']],
          new_state: state,
        };
        return [null, view];
      } else {
        const view = WizardUI.buildConfirmation({ ...state, selected_time: finalTime }, names.provider, names.service, input.timezone);
        return [null, view];
      }
    }
  }
}
