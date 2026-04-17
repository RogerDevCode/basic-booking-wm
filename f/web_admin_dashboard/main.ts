/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin stats and system overview KPIs
 * DB Tables Used  : bookings, providers, clients, users, booking_audit
 * Concurrency Risk: NO — read-only aggregate queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates admin_user_id
 */

import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';
import { InputSchema, type Input, type AdminDashboardResult } from './types';
import { fetchDashboardStats } from './services';

export async function main(rawInput: unknown): Promise<Result<AdminDashboardResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = input.admin_user_id;

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      return fetchDashboardStats(tx, input);
    });

    if (txErr) return [txErr, null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}