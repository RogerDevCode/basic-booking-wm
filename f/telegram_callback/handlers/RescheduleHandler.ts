import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class RescheduleHandler implements ActionHandler {
  async handle(_context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    return [null, {
      responseText: '🔄 Reprogramar cita',
      followUpText: 'Para reprogramar tu cita, responde con la fecha y hora que prefieres\\. Ejemplo: "Quiero el lunes a las 10am"\\.'
    }];
  }
}
