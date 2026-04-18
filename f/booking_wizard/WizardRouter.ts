import type { ActionContext, ActionHandler, StepView } from './types';

export class WizardRouter {
  private readonly handlers = new Map<string, ActionHandler>();

  register(action: string, handler: ActionHandler): void {
    this.handlers.set(action, handler);
  }

  async route(action: string, context: ActionContext): Promise<[Error | null, StepView | null]> {
    const handler = this.handlers.get(action);
    if (!handler) {
      return [new Error(`unhandled_action: ${action}`), null];
    }
    return handler.handle(context);
  }
}
