// ============================================================================
// WEB ADMIN SPECIALTIES CRUD — Manage medical specialties
// ============================================================================
// Actions: list, create, update, delete, activate, deactivate
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';

const ActionSchema = z.enum(['list', 'create', 'update', 'delete', 'activate', 'deactivate']);

const InputSchema = z.object({
  action: ActionSchema,
  specialty_id: z.uuid().optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

interface SpecialtyRow {
  readonly specialty_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: string;
}

type Result<T> = [Error | null, T | null];

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  return postgres(url, { ssl: 'require' });
}

async function listSpecialties(sql: postgres.Sql): Promise<Result<SpecialtyRow[]>> {
  try {
    const rows = await sql<SpecialtyRow[]>`
      SELECT specialty_id, name, description, category, is_active, sort_order, created_at
      FROM specialties ORDER BY sort_order ASC, name ASC
    `;
    return [null, rows as SpecialtyRow[]];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

async function createSpecialty(sql: postgres.Sql, input: z.infer<typeof InputSchema>): Promise<Result<SpecialtyRow>> {
  try {
    const name = input.name ?? '';
    if (name === '') return [new Error('create_failed: name is required'), null];
    const rows = await sql<SpecialtyRow[]>`
      INSERT INTO specialties (name, description, category, sort_order)
      VALUES (${name}, ${input.description ?? null}, ${input.category ?? 'Medicina'}, ${input.sort_order ?? 99})
      RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
    `;
    const row = rows[0];
    if (row == null) return [new Error('create_failed: no row returned'), null];
    return [null, row as SpecialtyRow];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate') || msg.includes('unique')) return [new Error(`create_failed: specialty '${input.name}' already exists`), null];
    return [new Error(`create_failed: ${msg}`), null];
  }
}

async function updateSpecialty(sql: postgres.Sql, id: string, input: z.infer<typeof InputSchema>): Promise<Result<SpecialtyRow>> {
  try {
    const fields: string[] = [];
    const params: (string | number | null)[] = [];
    let pIdx = 1;
    if (input.name != null) { fields.push(`name = $${String(pIdx++)}`); params.push(input.name); }
    if (input.description != null) { fields.push(`description = $${String(pIdx++)}`); params.push(input.description); }
    if (input.category != null) { fields.push(`category = $${String(pIdx++)}`); params.push(input.category); }
    if (input.sort_order != null) { fields.push(`sort_order = $${String(pIdx++)}`); params.push(input.sort_order); }
    if (fields.length === 0) return [new Error('update_failed: no fields provided'), null];
    params.push(id);
    const query = `UPDATE specialties SET ${fields.join(', ')} WHERE specialty_id = $${String(pIdx)}::uuid RETURNING specialty_id, name, description, category, is_active, sort_order, created_at`;
    const rows = await sql.unsafe(query, params) as SpecialtyRow[];
    const row = rows[0];
    if (row == null) return [new Error(`update_failed: specialty '${id}' not found`), null];
    return [null, row];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`update_failed: ${msg}`), null];
  }
}

async function deleteSpecialty(sql: postgres.Sql, id: string): Promise<Result<{ readonly deleted: boolean }>> {
  try {
    await sql`DELETE FROM specialties WHERE specialty_id = ${id}::uuid`;
    return [null, { deleted: true }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`delete_failed: ${msg}`), null];
  }
}

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };

  const input = parsed.data;
  const sql = getDb();

  try {
    if (input.action === 'list') {
      const [err, rows] = await listSpecialties(sql);
      if (err != null) return { success: false, data: null, error_message: err.message };
      const specialties = rows ?? [];
      return { success: true, data: { specialties, count: specialties.length }, error_message: null };
    }
    if (input.action === 'create') {
      const [err, result] = await createSpecialty(sql, input);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }
    if (input.action === 'update') {
      const id = input.specialty_id;
      if (id == null) return { success: false, data: null, error_message: 'update_failed: specialty_id is required' };
      const [err, result] = await updateSpecialty(sql, id, input);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }
    if (input.action === 'delete') {
      const id = input.specialty_id;
      if (id == null) return { success: false, data: null, error_message: 'delete_failed: specialty_id is required' };
      const [err, result] = await deleteSpecialty(sql, id);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }
    if (input.action === 'activate' || input.action === 'deactivate') {
      const id = input.specialty_id;
      if (id == null) return { success: false, data: null, error_message: `${input.action}_failed: specialty_id is required` };
      const active = input.action === 'activate';
      await sql`UPDATE specialties SET is_active = ${active} WHERE specialty_id = ${id}::uuid`;
      return { success: true, data: { specialty_id: id, is_active: active }, error_message: null };
    }
    return { success: false, data: null, error_message: `Unknown action: ${input.action}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  } finally {
    await sql.end();
  }
}
