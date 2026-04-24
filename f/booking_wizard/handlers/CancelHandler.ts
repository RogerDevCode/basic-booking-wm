import type { ActionContext, ActionHandler, StepView } from '../types.ts';

export class CancelHandler implements ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const { state } = context;
    const view: StepView = {
        message: '❌ Cancelado.',
        reply_keyboard: [['📅 Agendar cita', '📋 Mis citas']],
        new_state: { ...state, step: 0, selected_date: null, selected_time: null },
    };
    return Promise.resolve([null, view]);
  }
}
