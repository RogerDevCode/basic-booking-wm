import { WizardUI } from '../WizardUI';
import type { ActionContext, ActionHandler, StepView } from '../types';

export class StartHandler implements ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, StepView | null]> {
    const view = WizardUI.buildDateSelection(context.state, 0);
    return Promise.resolve([null, view]);
  }
}
