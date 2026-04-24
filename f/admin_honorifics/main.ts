//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : CRUD for honorifics management (list, create, update, delete)
 * DB Tables Used  : honorifics
 * Concurrency Risk: NO — single-row operations, no locks needed
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only + standard CRUD by honorific_id
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input } from './types.ts';
import { listHonorificsGlobal, createHonorific, updateHonorific, deleteHonorific } from './services.ts';

export async function main(args: any) : Promise<Result<unknown>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const effectiveTenantId = input.tenant_id;

  if (input.action === 'list') {
    const [err, rows] = await listHonorificsGlobal(sql);
    if (err != null) return [err, null];
    const honorifics = rows ?? [];
    return [null, { honorifics, count: honorifics.length }];
  }

  if (effectiveTenantId == null) {
    return [new Error('tenant_id is required for honorific mutations'), null];
  }

  if (input.action === 'create') {
    const code = input.code ?? '';
    const label = input.label ?? '';
    if (code === '' || label === '') {
      return [new Error('create_failed: code and label are required'), null];
    }
    const [err, row] = await withTenantContext(sql, effectiveTenantId, (tx) =>
      createHonorific(tx, code, label, input.gender ?? null, input.sort_order ?? 99, input.is_active ?? true)
    );
    if (err != null) return [err, null];
    return [null, row];
  }

  if (input.action === 'update') {
    const id = input.honorific_id;
    if (id == null) return [new Error('update_failed: honorific_id is required'), null];
    const [err, row] = await withTenantContext(sql, effectiveTenantId, (tx) =>
      updateHonorific(tx, id, input.code ?? null, input.label ?? null, input.gender ?? null, input.sort_order ?? null, input.is_active ?? null)
    );
    if (err != null) return [err, null];
    return [null, row];
  }

  if (input.action === 'delete') {
    const id = input.honorific_id;
    if (id == null) return [new Error('delete_failed: honorific_id is required'), null];
    const [err, result] = await withTenantContext(sql, effectiveTenantId, (tx) => deleteHonorific(tx, id));
    if (err != null) return [err, null];
    return [null, result];
  }

  return [new Error(`Unknown action: ${String(input.action)}`), null];
}