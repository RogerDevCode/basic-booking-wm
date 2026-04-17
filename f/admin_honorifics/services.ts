import postgres from 'postgres';
import type { Result } from '../internal/result';
import type { HonorificRow } from './types';

type HonorificRaw = readonly [string, string, string, string | null, number, boolean, string];

function mapRow(values: HonorificRaw): HonorificRow {
  return {
    honorific_id: values[0] ?? '',
    code: values[1] ?? '',
    label: values[2] ?? '',
    gender: values[3],
    sort_order: values[4] ?? 0,
    is_active: values[5] ?? false,
    created_at: values[6] ?? '',
  };
}

export async function listHonorifics(tx: postgres.Sql): Promise<Result<HonorificRow[]>> {
  const rows = await tx.values<HonorificRaw[]>`
    SELECT honorific_id, code, label, gender, sort_order, is_active, created_at
    FROM honorifics
    ORDER BY sort_order ASC, label ASC
  `;
  const honorifics = rows.map((r) => mapRow(r));
  return [null, honorifics];
}

export async function listHonorificsGlobal(client: postgres.Sql): Promise<Result<HonorificRow[]>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    const [err, data] = await listHonorifics(reserved);
    if (err !== null) { await reserved`ROLLBACK`; return [err, null]; }
    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => { /* ignore */ });
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

export async function createHonorific(
  tx: postgres.Sql,
  code: string,
  label: string,
  gender: string | null,
  sortOrder: number,
  isActive: boolean
): Promise<Result<HonorificRow>> {
  const rows = await tx.values<HonorificRaw[]>`
    INSERT INTO honorifics (code, label, gender, sort_order, is_active)
    VALUES (${code}, ${label}, ${gender}, ${sortOrder}, ${isActive})
    RETURNING honorific_id, code, label, gender, sort_order, is_active, created_at
  `;
  const row = rows[0];
  if (row === undefined) return [new Error('create_failed: no row returned'), null];
  return [null, mapRow(row)];
}

export async function updateHonorific(
  tx: postgres.Sql,
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
  const rows = await tx.values<HonorificRaw[]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error(`update_failed: honorific '${id}' not found`), null];
  return [null, mapRow(row)];
}

export async function deleteHonorific(tx: postgres.Sql, id: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM honorifics WHERE honorific_id = ${id}::uuid`;
  return [null, { deleted: true }];
}