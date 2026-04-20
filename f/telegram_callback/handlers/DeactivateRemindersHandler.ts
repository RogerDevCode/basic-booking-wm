import { createDbClient } from '../../internal/db/client';
import { withTenantContext } from '../../internal/tenant-context/index';
import { updateReminderPreferences } from '../updateReminderPreferences';
import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class DeactivateRemindersHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    const effectiveClientId = context.client_id ?? process.env['PATIENT_ID'];
    if (!effectiveClientId) {
      return [new Error('PATIENT_ID not available'), null];
    }

    const sql = createDbClient({ url: context.dbUrl });
    const [txErr, success] = await withTenantContext(sql, context.tenantId, async (tx) => {
      return updateReminderPreferences(tx, effectiveClientId, false);
    });
    await sql.end();

    let responseText: string;
    let followUpText: string | null;

    if (txErr) {
      responseText = '❌ Error al desactivar';
      followUpText = 'No pudimos desactivar tus recordatorios\\. Intenta de nuevo más tarde\\.';
    } else if (success) {
      responseText = '🔕 Recordatorios desactivados';
      followUpText = 'Tus recordatorios han sido desactivados\\. No recibirás avisos automáticos\\.';
    } else {
      responseText = '❌ Error al desactivar';
      followUpText = 'No pudimos desactivar tus recordatorios\\. Intenta de nuevo más tarde\\.';
    }

    return [null, { responseText, followUpText }];
  }
}
