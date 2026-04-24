import { DateUtils } from '../DateUtils.ts';
import { WizardUI } from '../WizardUI.ts';
import type { ActionContext, ActionHandler, StepView } from '../types.ts';

export class SelectDateHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const { input, state, repo, serviceDurationMin } = context;
    const dateStr = input.user_input !== undefined ? DateUtils.parseDate(input.user_input) : null;
    const finalDate = dateStr ?? state.selected_date;

    if (finalDate === null) {
      const view = WizardUI.buildDateSelection(state, 0);
      return [null, view];
    } else {
      const [err, slots] = input.provider_id !== undefined
        ? await repo.getAvailableSlots(input.provider_id, finalDate, serviceDurationMin)
        : [null, DateUtils.generateTimeSlots(8, 18, serviceDurationMin)];

      if (err !== null || slots === null || slots.length === 0) {
        const msg = slots?.length === 0 ? `😅 No hay horarios para el ${DateUtils.format(finalDate, input.timezone)}.` : 'Error al buscar disponibilidad.';
        const baseView = WizardUI.buildDateSelection({ ...state, selected_date: null }, 0);
        const view: StepView = { ...baseView, message: `${msg}\n\n${baseView.message}` };
        return [null, view];
      } else {
        const view = WizardUI.buildTimeSelection({ ...state, selected_date: finalDate }, slots, input.timezone);
        return [null, view];
      }
    }
  }
}
