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
 * - Refactor specialties CRUD to follow SOLID principles.
 * - Separate DB access (Repository) from orchestration (Dispatcher).
 * - Enforce RLS via withTenantContext using admin_user_id as tenantId.
 * - Maintain strict Go-style error handling [Error | null, T | null].
 *
 * ### Schema Verification
 * - Tables: specialties (specialty_id, name, description, category, is_active, sort_order, created_at)
 * - Columns: Verified against migrations/010_complete_provider_schema.sql.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Malformed UUID for specialty_id or admin_user_id → Zod/TenantContext catch early.
 * - Scenario 2: DB constraint violation (e.g., unique name) → Caught in repo and propagated.
 * - Scenario 3: Update with no fields → Handled by update logic.
 *
 * ### Concurrency Analysis
 * - Risk: NO — Single-row operations.
 *
 * ### SOLID Compliance Check
 * - SRP: SpecialtyRepository (Data), ActionHandlers (Logic), Main (Infrastructure).
 * - OCP: Action dispatcher map allows adding new actions without modifying routing logic.
 * - DIP: Business logic depends on TxClient abstraction.
 *
 * → CLEARED FOR CODE GENERATION
 */

import "@total-typescript/ts-reset";
import { z } from 'zod';
import { createDbClient } from '../internal/db/client';
import { withTenantContext, type TxClient } from '../internal/tenant-context';
import type { Result } from '../internal/result';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ActionSchema = z.enum(['list', 'create', 'update', 'delete', 'activate', 'deactivate']);

const InputSchema = z.object({
  admin_user_id: z.uuid(), // Required for withTenantContext (§12.4)
  action: ActionSchema,
  specialty_id: z.uuid().optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

type Input = Readonly<z.infer<typeof InputSchema>>;

interface SpecialtyRow {
  readonly specialty_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
}

// ============================================================================
// REPOSITORY (SRP: Data Access Only)
// ============================================================================

const SpecialtyRepository = {
  async list(tx: TxClient): Promise<Result<readonly SpecialtyRow[]>> {
    try {
      const rows = await tx<SpecialtyRow[]>`
        SELECT specialty_id, name, description, category, is_active, sort_order, created_at
        FROM specialties ORDER BY sort_order ASC, name ASC
      `;
      return [null, Object.freeze(rows)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`list_failed: ${msg}`), null];
    }
  },

  async create(tx: TxClient, input: Input): Promise<Result<SpecialtyRow>> {
    try {
      const name = input.name;
      if (!name) return [new Error('create_failed: name is required'), null];

      const rows = await tx<SpecialtyRow[]>`
        INSERT INTO specialties (name, description, category, sort_order)
        VALUES (${name}, ${input.description ?? null}, ${input.category ?? 'Medicina'}, ${input.sort_order ?? 99})
        RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
      `;
      const row = rows[0];
      if (!row) return [new Error('create_failed: no row returned'), null];
      return [null, Object.freeze(row)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`create_failed: ${msg}`), null];
    }
  },

  async update(tx: TxClient, id: string, input: Input): Promise<Result<SpecialtyRow>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData['name'] = input.name;
      if (input.description !== undefined) updateData['description'] = input.description;
      if (input.category !== undefined) updateData['category'] = input.category;
      if (input.sort_order !== undefined) updateData['sort_order'] = input.sort_order;

      if (Object.keys(updateData).length === 0) {
        return [new Error('update_failed: no fields provided'), null];
      }

      const rows = await tx<SpecialtyRow[]>`
        UPDATE specialties SET ${tx(updateData)}
        WHERE specialty_id = ${id}::uuid
        RETURNING specialty_id, name, description, category, is_active, sort_order, created_at
      `;
      const row = rows[0];
      if (!row) return [new Error(`update_failed: specialty '${id}' not found`), null];
      return [null, Object.freeze(row)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`update_failed: ${msg}`), null];
    }
  },

  async delete(tx: TxClient, id: string): Promise<Result<{ readonly deleted: boolean }>> {
    try {
      await tx`DELETE FROM specialties WHERE specialty_id = ${id}::uuid`;
      return [null, { deleted: true }];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`delete_failed: ${msg}`), null];
    }
  },

  async setStatus(tx: TxClient, id: string, active: boolean): Promise<Result<{ readonly specialty_id: string; readonly is_active: boolean }>> {
    try {
      const rows = await tx`
        UPDATE specialties SET is_active = ${active}
        WHERE specialty_id = ${id}::uuid
        RETURNING specialty_id
      `;
      if (rows.length === 0) return [new Error(`status_update_failed: specialty '${id}' not found`), null];
      return [null, { specialty_id: id, is_active: active }];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [new Error(`status_update_failed: ${msg}`), null];
    }
  }
};

// ============================================================================
// DISPATCHER (OCP: Open for new actions, Closed for modification)
// ============================================================================

type ActionHandler = (tx: TxClient, input: Input) => Promise<Result<unknown>>;

const Handlers: Readonly<Record<z.infer<typeof ActionSchema>, ActionHandler>> = {
  list: (tx) => SpecialtyRepository.list(tx),
  create: (tx, input) => SpecialtyRepository.create(tx, input),
  update: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('update_failed: specialty_id is required'), null]);
    return SpecialtyRepository.update(tx, id, input);
  },
  delete: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('delete_failed: specialty_id is required'), null]);
    return SpecialtyRepository.delete(tx, id);
  },
  activate: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('activate_failed: specialty_id is required'), null]);
    return SpecialtyRepository.setStatus(tx, id, true);
  },
  deactivate: (tx, input) => {
    const id = input.specialty_id;
    if (!id) return Promise.resolve([new Error('deactivate_failed: specialty_id is required'), null]);
    return SpecialtyRepository.setStatus(tx, id, false);
  }
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_failed: ${parsed.error.message}`), null];
  }
  const input = parsed.data;

  // 2. Setup DB Client
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('configuration_failed: DATABASE_URL is required'), null];
  }
  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Execute with Tenant Context (§12.4)
    // We use admin_user_id as the tenant ID for isolation and logging.
    const [err, data] = await withTenantContext(sql, input.admin_user_id, async (tx) => {
      const handler = Handlers[input.action];
      return handler(tx, input);
    });

    return [err, data];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`execution_failed: ${msg}`), null];
  } finally {
    // 4. Guaranteed release
    await sql.end();
  }
}
