import { createDbClient } from '../../internal/db/client.ts';
import { withTenantContext } from '../../internal/tenant-context/index.ts';
import { updateReminderPreferences } from '../updateReminderPreferences.ts';
import type { ActionContext, ActionHandler, ActionResult } from '../types.ts';

export class ActivateRemindersHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    const effectiveClientId = context.client_id ?? process.env['PATIENT_ID'];
    if (!effectiveClientId) {
      return [new Error('PATIENT_ID not available'), null];
    }

    const sql = createDbClient({ url: context.dbUrl });
    const [txErr, success] = await withTenantContext(sql, context.tenantId, async (tx) => {
      return updateReminderPreferences(tx, effectiveClientId, true);
    });
    await sql.end();

    let responseText: string;
    let followUpText: string | null;

    if (txErr) {
      responseText = '❌ Error al activar';
      followUpText = 'No pudimos activar tus recordatorios. Intenta de nuevo más tarde.';
    } else if (success) {
      responseText = '🔔 Recordatorios activados';
      followUpText = 'Tus recordatorios han sido activados. Recibirás avisos a 24h, 2h y 30min antes de tus citas.';
    } else {
      responseText = '❌ Error al activar';
      followUpText = 'No pudimos activar tus recordatorios. Intenta de nuevo más tarde.';
    }

    return [null, { responseText, followUpText }];
  }
}
