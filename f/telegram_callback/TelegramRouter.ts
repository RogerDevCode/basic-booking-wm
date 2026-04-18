import type { ActionContext, ActionHandler, ActionResult } from './types';

export class TelegramRouter {
  private readonly handlers = new Map<string, ActionHandler>();

  register(action: string, handler: ActionHandler): void {
    this.handlers.set(action, handler);
  }

  async route(action: string, context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    const handler = this.handlers.get(action);
    if (!handler) {
      return [null, {
        responseText: '⚠️ Acción no reconocida',
        followUpText: null
      }];
    }
    return handler.handle(context);
  }
}
