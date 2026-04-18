import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class AcknowledgeHandler implements ActionHandler {
  handle(_context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    return Promise.resolve([null, {
      responseText: '✅ Recibido',
      followUpText: null
    }]);
  }
}
