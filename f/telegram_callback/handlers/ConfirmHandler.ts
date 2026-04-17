import { createDbClient } from '../../internal/db/client';
import { withTenantContext } from '../../internal/tenant-context';
import { confirmBooking } from '../confirmBooking';
import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class ConfirmHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    const sql = createDbClient({ url: context.dbUrl });
    const [txErr, success] = await withTenantContext(sql, context.tenantId, async (tx) => {
      return confirmBooking(tx, context.booking_id, context.client_id);
    });
    await sql.end();

    let responseText = '';
    let followUpText: string | null = null;

    if (txErr) {
      responseText = '❌ No se pudo confirmar';
      followUpText = 'No pudimos confirmar tu cita. Motivo: error interno. Contacta a soporte si necesitas ayuda.';
    } else if (success) {
      responseText = '✅ Cita confirmada';
      followUpText = 'Tu cita ha sido confirmada. ¡Te esperamos!';
    } else {
      responseText = '❌ No se pudo confirmar';
      followUpText = 'No pudimos confirmar tu cita. La cita no existe o ya fue modificada. Contacta a soporte.';
    }

    return [null, { responseText, followUpText }];
  }
}
