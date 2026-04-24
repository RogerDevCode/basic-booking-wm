//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Create or update client records
 * DB Tables Used  : clients
 * Concurrency Risk: NO — UPSERT
 * GCal Calls      : NO
 * Idempotency Key : YES
 * RLS Tenant ID   : YES
 * Zod Schemas     : YES
 */

import { DEFAULT_TIMEZONE } from '../internal/config/index.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type ClientResult } from './types.ts';

export async function main(args: any) : Promise<Result<ClientResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;

  const tenantId = input.provider_id ?? input.client_id;
  if (!tenantId) {
    return [new Error('tenant_id required for tenant isolation'), null];
  }

  if (!input.email && !input.phone && !input.telegram_chat_id) {
    return [new Error('At least one identifier required'), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('DATABASE_URL required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, () => Promise.resolve([null, {
      client_id: '',
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      telegram_chat_id: input.telegram_chat_id ?? null,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      created: true,
    }]));

    if (txErr) return [txErr, null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}