import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class AcknowledgeHandler implements ActionHandler {
  async handle(_context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    return [null, {
      responseText: '✅ Recibido',
      followUpText: null
    }];
  }
}
