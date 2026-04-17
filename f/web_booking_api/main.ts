/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Web Booking API orchestrator (crear/cancelar/reagendar)
 * DB Tables Used  : providers, services, bookings, clients, users
 * Concurrency Risk: YES — uses SELECT FOR UPDATE on provider row
 * GCal Calls      : NO — handled by async background sync
 * Idempotency Key : YES — deterministic SHA-256 derivation
 * RLS Tenant ID   : YES — withTenantContext enforces provider_id isolation
 * Zod Schemas     : YES — InputSchema validation
 */

import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { withTenantContext } from '../internal/tenant-context';
import { type BookingResult, InputSchema } from './types';
import * as Repository from './repository';
import * as Service from './service';

export async function main(rawInput: unknown): Promise<Result<BookingResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return [new Error(`error_validacion: ${parsed.error.message}`), null];

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('configuracion_db_faltante'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    const input = parsed.data;

    // 1. Resolve Tenant Context
    let tenantId: string;
    if (input.action === 'crear') {
      if (!input.provider_id) return [new Error('provider_id_requerido'), null];
      tenantId = input.provider_id;
    } else {
      if (!input.booking_id) return [new Error('booking_id_requerido'), null];
      const [err, resolved] = await Repository.resolveTenantForBooking(sql, input.booking_id);
      if (err || !resolved) return [err ?? new Error('resolucion_tenant_fallida'), null];
      tenantId = resolved;
    }

    // 2. Execute within Tenant Isolation Context (RLS)
    return await withTenantContext(sql, tenantId, async (tx) => {
      const [clientErr, clientId] = await Repository.resolveClientId(tx, input.user_id);
      if (clientErr || !clientId) return [clientErr ?? new Error('resolucion_cliente_fallida'), null];

      switch (input.action) {
        case 'crear':     return Service.crear(tx, tenantId, clientId, input);
        case 'cancelar':  return Service.cancelar(tx, clientId, input);
        case 'reagendar': return Service.reagendar(tx, tenantId, clientId, input);
        default: {
          const _exhaustive: never = input.action;
          return [new Error(`accion_no_soportada: ${String(_exhaustive)}`), null];
        }
      }
    });

  } catch (e) {
    return [new Error(`error_inesperado: ${String(e)}`), null];
  } finally {
    await sql.end();
  }
}
