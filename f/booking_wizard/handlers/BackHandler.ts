import { DateUtils } from '../DateUtils.ts';
import { WizardUI } from '../WizardUI.ts';
import type { ActionContext, ActionHandler, StepView } from '../types.ts';

export class BackHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const { input, state, repo, serviceDurationMin } = context;

    if (state.step <= 1) {
      const view: StepView = {
        message: '📋 Menú principal.',
        reply_keyboard: [['📅 Agendar cita', '📋 Mis citas']],
        new_state: { ...state, step: 0 },
      };
      return [null, view];
    } else if (state.step === 2) {
      const view = WizardUI.buildDateSelection({ ...state, selected_date: null }, 0);
      return [null, view];
    } else if (state.step === 3) {
      const [_err, slots] = (input.provider_id !== undefined && state.selected_date !== null)
        ? await repo.getAvailableSlots(input.provider_id, state.selected_date, serviceDurationMin)
        : [null, DateUtils.generateTimeSlots(8, 18, serviceDurationMin)];
      const view = WizardUI.buildTimeSelection({ ...state, selected_time: null }, slots ?? [], input.timezone);
      return [null, view];
    } else {
      const view = WizardUI.buildDateSelection({ ...state, selected_date: null, selected_time: null }, 0);
      return [null, view];
    }
  }
}
