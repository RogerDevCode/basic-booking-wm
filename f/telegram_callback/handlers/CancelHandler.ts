import { createDbClient } from '../../internal/db/client';
import { withTenantContext } from '../../internal/tenant-context/index';
import { updateBookingStatus } from '../updateBookingStatus';
import type { ActionContext, ActionHandler, ActionResult } from '../types';

export class CancelHandler implements ActionHandler {
  async handle(context: ActionContext): Promise<[Error | null, ActionResult | null]> {
    const sql = createDbClient({ url: context.dbUrl });
    const [txErr, success] = await withTenantContext(sql, context.tenantId, async (tx) => {
      return updateBookingStatus(tx, context.booking_id, 'cancelled', context.client_id, 'client');
    });
    await sql.end();

    let responseText: string;
    let followUpText: string | null;

    if (txErr) {
      responseText = '❌ No se pudo cancelar';
      followUpText = 'No pudimos cancelar tu cita. Motivo: error interno. Contacta a soporte si necesitas ayuda.';
    } else if (success) {
      responseText = '✅ Cita cancelada';
      followUpText = 'Tu cita ha sido cancelada exitosamente. Si deseas reagendar, escribe "quiero agendar una cita".';
    } else {
      responseText = '❌ No se pudo cancelar';
      followUpText = 'No pudimos cancelar tu cita. La cita no existe o ya fue modificada. Contacta a soporte.';
    }

    return [null, { responseText, followUpText }];
  }
}
