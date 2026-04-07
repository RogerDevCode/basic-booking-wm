// ============================================================================
// ADMIN HONORIFICS — CRUD for honorifics management
// ============================================================================
// Actions: list, create, update, delete
// Used by: Admin dashboard for managing honorifics (Dr., Dra., Ing., etc.)
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ActionSchema = z.enum(['list', 'create', 'update', 'delete']);

const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  honorific_id: z.uuid().optional(),
  code: z.string().max(10).optional(),
  label: z.string().max(10).optional(),
  gender: z.enum(['M', 'F', 'N']).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
});

interface HonorificRow {
  readonly honorific_id: string;
  readonly code: string;
  readonly label: string;
  readonly gender: string | null;
  readonly sort_order: number;
  readonly is_active: boolean;
  readonly created_at: string;
}

type Result<T> = [Error | null, T | null];

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

async function listHonorifics(tx: postgres.TransactionSql): Promise<Result<HonorificRow[]>> {
  const rows = await tx.values<[string, string, string, string | null, number, boolean, string][]>`
    SELECT honorific_id, code, label, gender, sort_order, is_active, created_at
    FROM honorifics
    ORDER BY sort_order ASC, label ASC
  `;
  const honorifics: HonorificRow[] = rows.map((row) => ({
    honorific_id: row[0],
    code: row[1],
    label: row[2],
    gender: row[3],
    sort_order: row[4],
    is_active: row[5],
    created_at: row[6],
  }));
  return [null, honorifics];
}

async function createHonorific(
  tx: postgres.TransactionSql,
  code: string,
  label: string,
  gender: string | null,
  sortOrder: number,
  isActive: boolean
): Promise<Result<HonorificRow>> {
  const rows = await tx.values<[string, string, string, string | null, number, boolean, string][]>`
    INSERT INTO honorifics (code, label, gender, sort_order, is_active)
    VALUES (${code}, ${label}, ${gender}, ${sortOrder}, ${isActive})
    RETURNING honorific_id, code, label, gender, sort_order, is_active, created_at
  `;
  const row = rows[0];
  if (row === undefined) return [new Error('create_failed: no row returned'), null];
  return [null, {
    honorific_id: row[0],
    code: row[1],
    label: row[2],
    gender: row[3],
    sort_order: row[4],
    is_active: row[5],
    created_at: row[6],
  }];
}

async function updateHonorific(
  tx: postgres.TransactionSql,
  id: string,
  code: string | null,
  label: string | null,
  gender: string | null,
  sortOrder: number | null,
  isActive: boolean | null
): Promise<Result<HonorificRow>> {
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let paramIdx = 1;

  if (code != null) { fields.push(`code = $${String(paramIdx++)}`); params.push(code); }
  if (label != null) { fields.push(`label = $${String(paramIdx++)}`); params.push(label); }
  if (gender != null) { fields.push(`gender = $${String(paramIdx++)}`); params.push(gender); }
  if (sortOrder != null) { fields.push(`sort_order = $${String(paramIdx++)}`); params.push(sortOrder); }
  if (isActive != null) { fields.push(`is_active = $${String(paramIdx++)}`); params.push(isActive); }

  if (fields.length === 0) return [new Error('update_failed: no fields provided'), null];

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const query = `UPDATE honorifics SET ${fields.join(', ')} WHERE honorific_id = $${String(paramIdx)}::uuid RETURNING honorific_id, code, label, gender, sort_order, is_active, created_at`;
  const rows = await tx.values<[string, string, string, string | null, number, boolean, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error(`update_failed: honorific '${id}' not found`), null];
  return [null, {
    honorific_id: row[0],
    code: row[1],
    label: row[2],
    gender: row[3],
    sort_order: row[4],
    is_active: row[5],
    created_at: row[6],
  }];
}

async function deleteHonorific(tx: postgres.TransactionSql, id: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM honorifics WHERE honorific_id = ${id}::uuid`;
  return [null, { deleted: true }];
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const effectiveTenantId = input.tenant_id || input.honorific_id || '00000000-0000-0000-0000-000000000000';

  if (input.action === 'list') {
    const [err, rows] = await withTenantContext(sql, effectiveTenantId, listHonorifics);
    if (err != null) return [err, null];
    const honorifics = rows ?? [];
    return [null, { honorifics, count: honorifics.length }];
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

  return [new Error(`Unknown action: ${input.action}`), null];
}
