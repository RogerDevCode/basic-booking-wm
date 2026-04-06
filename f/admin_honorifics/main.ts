// ============================================================================
// ADMIN HONORIFICS — CRUD for honorifics management
// ============================================================================
// Actions: list, create, update, delete
// Used by: Admin dashboard for managing honorifics (Dr., Dra., Ing., etc.)
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ActionSchema = z.enum(['list', 'create', 'update', 'delete']);

const InputSchema = z.object({
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
// DB HELPERS
// ============================================================================

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') {
    throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  }
  return postgres(url, { ssl: 'require' });
}

async function withTransaction<T>(
  operation: (sql: postgres.Sql) => Promise<Result<T>>
): Promise<Result<T>> {
  const sql = getDb();
  try {
    const [err, result] = await operation(sql);
    if (err != null) return [err, null];
    return [null, result];
  } finally {
    await sql.end();
  }
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

async function listHonorifics(sql: postgres.Sql): Promise<Result<HonorificRow[]>> {
  try {
    const rows = await sql<HonorificRow[]>`
      SELECT honorific_id, code, label, gender, sort_order, is_active, created_at
      FROM honorifics
      ORDER BY sort_order ASC, label ASC
    `;
    return [null, rows as HonorificRow[]];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

async function createHonorific(
  sql: postgres.Sql,
  code: string,
  label: string,
  gender: string | null,
  sortOrder: number,
  isActive: boolean
): Promise<Result<HonorificRow>> {
  try {
    const rows = await sql<HonorificRow[]>`
      INSERT INTO honorifics (code, label, gender, sort_order, is_active)
      VALUES (${code}, ${label}, ${gender}, ${sortOrder}, ${isActive})
      RETURNING honorific_id, code, label, gender, sort_order, is_active, created_at
    `;
    const row = rows[0];
    if (row == null) return [new Error('create_failed: no row returned'), null];
    return [null, row as HonorificRow];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return [new Error(`create_failed: code '${code}' already exists`), null];
    }
    return [new Error(`create_failed: ${msg}`), null];
  }
}

async function updateHonorific(
  sql: postgres.Sql,
  id: string,
  code: string | null,
  label: string | null,
  gender: string | null,
  sortOrder: number | null,
  isActive: boolean | null
): Promise<Result<HonorificRow>> {
  try {
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
    const rows = await sql.unsafe(query, params) as HonorificRow[];
    const row = rows[0];
    if (row == null) return [new Error(`update_failed: honorific '${id}' not found`), null];
    return [null, row];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return [new Error(`update_failed: code '${code}' already exists`), null];
    }
    return [new Error(`update_failed: ${msg}`), null];
  }
}

async function deleteHonorific(sql: postgres.Sql, id: string): Promise<Result<{ readonly deleted: boolean }>> {
  try {
    await sql`DELETE FROM honorifics WHERE honorific_id = ${id}::uuid`;
    return [null, { deleted: true }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`delete_failed: ${msg}`), null];
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<{
  readonly success: boolean;
  readonly data: unknown | null;
  readonly error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const input = parsed.data;

  try {
    if (input.action === 'list') {
      const [err, rows] = await withTransaction(listHonorifics);
      if (err != null) return { success: false, data: null, error_message: err.message };
      const honorifics = rows ?? [];
      return { success: true, data: { honorifics, count: honorifics.length }, error_message: null };
    }

    if (input.action === 'create') {
      const code = input.code ?? '';
      const label = input.label ?? '';
      if (code === '' || label === '') {
        return { success: false, data: null, error_message: 'create_failed: code and label are required' };
      }
      const [err, row] = await withTransaction((sql) =>
        createHonorific(sql, code, label, input.gender ?? null, input.sort_order ?? 99, input.is_active ?? true)
      );
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: row, error_message: null };
    }

    if (input.action === 'update') {
      const id = input.honorific_id;
      if (id == null) return { success: false, data: null, error_message: 'update_failed: honorific_id is required' };
      const [err, row] = await withTransaction((sql) =>
        updateHonorific(sql, id, input.code ?? null, input.label ?? null, input.gender ?? null, input.sort_order ?? null, input.is_active ?? null)
      );
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: row, error_message: null };
    }

    if (input.action === 'delete') {
      const id = input.honorific_id;
      if (id == null) return { success: false, data: null, error_message: 'delete_failed: honorific_id is required' };
      const [err, result] = await withTransaction((sql) => deleteHonorific(sql, id));
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    return { success: false, data: null, error_message: `Unknown action: ${input.action}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  }
}
