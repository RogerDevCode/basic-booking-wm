import { WizardUI } from '../WizardUI.ts';
import type { ActionContext, ActionHandler, StepView } from '../types.ts';

export class StartHandler implements ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const view = WizardUI.buildDateSelection(context.state, 0);
    return Promise.resolve([null, view]);
  }
}
