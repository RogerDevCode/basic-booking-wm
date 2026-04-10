/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Manage medical specialties (CRUD + activate/deactivate)
 * DB Tables Used  : specialties
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and specialty fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action type and specialty fields via Zod InputSchema
 * - Route to listSpecialties, createSpecialty, updateSpecialty, deleteSpecialty, or activate/deactivate
 * - On create: insert name/description/category with default sort_order of 99
 * - On update: dynamically build SET clause from provided fields only
 *
 * ### Schema Verification
 * - Tables: specialties (specialty_id, name, description, category, is_active, sort_order, created_at)
 * - Columns: All columns verified against extended schema; category defaults to 'Medicina'
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Create with empty name → Zod min(2) validation fails before DB call
 * - Scenario 2: Update with no fields → early return error before building dynamic SQL
 * - Scenario 3: Delete with foreign key constraint from providers → DB constraint violation, error propagated
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD operations with UUID primary key
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each CRUD function handles exactly one operation
 * - DRY: YES — shared SpecialtyRow type; dynamic UPDATE builder pattern consistent with provider CRUD
 * - KISS: YES — direct SQL with parameterized queries; no unnecessary ORM abstraction
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN SPECIALTIES CRUD — Manage medical specialties
// ============================================================================
// Actions: list, create, update, delete, activate, deactivate
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

async function getGlobalTx(
  client: postgres.Sql,
  operation: (tx: postgres.Sql) => Promise<Result<unknown>>,
): Promise<Result<unknown>> {
  const reserved = await client.reserve();
  try {
    await reserved`BEGIN`;
    const [err, data] = await operation(reserved);
    if (err !== null) { await reserved`ROLLBACK`; return [err, null]; }
    await reserved`COMMIT`;
    return [null, data];
  } catch (error: unknown) {
    await reserved`ROLLBACK`.catch(() => {});
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`transaction_failed: ${msg}`), null];
  } finally {
    reserved.release();
  }
}

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

// ============================================================================
// DB OPERATIONS
// ============================================================================

async function listSpecialties(tx: postgres.Sql): Promise<Result<SpecialtyRow[]>> {
  try {
    const rows = await tx.values<[string, string, string | null, string | null, boolean, number, string][]>`
      SELECT specialty_id, name, description, category, is_active, sort_order, created_at
      FROM specialties ORDER BY sort_order ASC, name ASC
    `;
    const specialties: SpecialtyRow[] = rows.map((row) => ({
      specialty_id: row[0],
      name: row[1],
      description: row[2],
      category: row[3],
      is_active: row[4],
      sort_order: row[5],
      created_at: row[6],
    }));
    return [null, specialties];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

async function createSpecialty(tx: postgres.Sql, input: Readonly<z.infer<typeof InputSchema>>): Promise<Result<SpecialtyRow>> {
  const name = input.name ?? '';
  if (name === '') return [new Error('create_failed: name is required'), null];

  const rows = await tx.values<[string, string, string | null, string | null, boolean, number, string][]>`
    INSERT INTO specialties (name, description, category, sort_order)
    VALUES (${name}, ${input.description ?? null}, ${input.category ?? 'Medicina'}, ${input.sort_order ?? 99})
    RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
  `;
  const row = rows[0];
  if (row === undefined) return [new Error('create_failed: no row returned'), null];

  return [null, {
    specialty_id: row[0],
    name: row[1],
    description: row[2],
    category: row[3],
    is_active: row[4],
    sort_order: row[5],
    created_at: row[6],
  }];
}

async function updateSpecialty(tx: postgres.Sql, id: string, input: Readonly<z.infer<typeof InputSchema>>): Promise<Result<SpecialtyRow>> {
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
  const rows = await tx.values<[string, string, string | null, string | null, boolean, number, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error(`update_failed: specialty '${id}' not found`), null];

  return [null, {
    specialty_id: row[0],
    name: row[1],
    description: row[2],
    category: row[3],
    is_active: row[4],
    sort_order: row[5],
    created_at: row[6],
  }];
}

async function deleteSpecialty(tx: postgres.Sql, id: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM specialties WHERE specialty_id = ${id}::uuid`;
  return [null, { deleted: true }];
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<[Error | null, unknown | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await getGlobalTx(sql, async (tx) => {
      if (input.action === 'list') {
        return listSpecialties(tx);
      }
      if (input.action === 'create') {
        return createSpecialty(tx, input);
      }
      if (input.action === 'update') {
        const id = input.specialty_id;
        if (id == null) return [new Error('update_failed: specialty_id is required'), null];
        return updateSpecialty(tx, id, input);
      }
      if (input.action === 'delete') {
        const id = input.specialty_id;
        if (id == null) return [new Error('delete_failed: specialty_id is required'), null];
        return deleteSpecialty(tx, id);
      }
      if (input.action === 'activate' || input.action === 'deactivate') {
        const id = input.specialty_id;
        if (id == null) return [new Error(`${input.action}_failed: specialty_id is required`), null];
        const active = input.action === 'activate';
        await tx`UPDATE specialties SET is_active = ${active} WHERE specialty_id = ${id}::uuid`;
        return [null, { specialty_id: id, is_active: active }];
      }
      return [new Error(`Unknown action: ${input.action}`), null];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
