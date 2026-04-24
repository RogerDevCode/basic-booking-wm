import type { ActionContext, ActionHandler, ActionResult } from '../types.ts';

export class RescheduleHandler implements ActionHandler {
  handle(_context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    return Promise.resolve([null, {
      responseText: '🔄 Reprogramar cita',
      followUpText: 'Para reprogramar tu cita, responde con la fecha y hora que prefieres\\. Ejemplo: "Quiero el lunes a las 10am"\\.'
    }]);
  }
}
