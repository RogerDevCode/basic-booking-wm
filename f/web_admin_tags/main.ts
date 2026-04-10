/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin CRUD for tag categories and tags
 * DB Tables Used  : tag_categories, tags
 * Concurrency Risk: NO — simple CRUD, no locks needed
 * GCal Calls      : NO
 * Idempotency Key : N/A — admin operations
 * RLS Tenant ID   : YES — withTenantContext wraps all queries
 * Zod Schemas     : YES — all inputs validated
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate admin_user_id, action, and tag/category fields via Zod InputSchema
 * - Verify admin role from users table before any operation
 * - Route to category CRUD (list/create/update/delete/activate/deactivate) or tag CRUD
 * - list_all action fetches both categories and tags in a single transaction
 *
 * ### Schema Verification
 * - Tables: tag_categories (category_id, name, description, is_active, sort_order, created_at, updated_at), tags (tag_id, category_id, name, description, color, is_active, sort_order, created_at, updated_at), users (user_id, role, is_active)
 * - Columns: All verified; tags JOIN tag_categories for category_name enrichment
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Admin not found or non-admin role → early rejection before any CRUD operation
 * - Scenario 2: Delete category with existing tags → FK constraint violation, error propagated
 * - Scenario 3: Color validation fails → Zod regex check catches invalid hex before DB
 * - Scenario 4: Empty update fields → early return error prevents zero-field UPDATE query
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD with UUID primary keys; no concurrent write conflicts
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each function handles exactly one entity operation (category or tag)
 * - DRY: YES — shared dynamic UPDATE builder pattern; toggle helper for activate/deactivate
 * - KISS: YES — direct SQL with typed value arrays; exhaustive switch ensures no unknown action slips through
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN TAGS — Tag system management for admin dashboard
// ============================================================================
// Generic tag system usable across domains (medical, legal, customer service).
// Admin can:
//   - CRUD tag categories (grouping tags logically)
//   - CRUD tags within categories
//   - Activate/deactivate tags and categories
//   - Reorder tags via sort_order
//
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ─── Schemas ────────────────────────────────────────────────────────────────

const ActionSchema = z.enum([
  'list_categories',
  'create_category',
  'update_category',
  'delete_category',
  'activate_category',
  'deactivate_category',
  'list_tags',
  'create_tag',
  'update_tag',
  'delete_tag',
  'activate_tag',
  'deactivate_tag',
  'list_all',
]);

const InputSchema = z.object({
  admin_user_id: z.uuid(),
  action: ActionSchema,
  category_id: z.uuid().optional(),
  tag_id: z.uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  is_active: z.boolean().optional(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryRow {
  readonly category_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: string;
  readonly tag_count: number;
}

interface TagRow {
  readonly tag_id: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly name: string;
  readonly description: string | null;
  readonly color: string;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: string;
}

// ─── Category CRUD ──────────────────────────────────────────────────────────

async function listCategories(tx: postgres.Sql): Promise<Result<CategoryRow[]>> {
  const rows = await tx.values<[string, string, string | null, boolean, number, string, number][]>`
    SELECT tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at,
           COUNT(t.tag_id) FILTER (WHERE t.is_active = true) AS tag_count
    FROM tag_categories tc
    LEFT JOIN tags t ON t.category_id = tc.category_id
    GROUP BY tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at
    ORDER BY tc.sort_order ASC, tc.name ASC
  `;

  const categories: CategoryRow[] = rows.map((row) => ({
    category_id: row[0],
    name: row[1],
    description: row[2],
    is_active: row[3],
    sort_order: row[4],
    created_at: row[5],
    tag_count: row[6],
  }));

  return [null, categories];
}

async function createCategory(
  tx: postgres.Sql,
  name: string,
  description: string | null,
  sortOrder: number,
): Promise<Result<CategoryRow>> {
  const rows = await tx.values<[string, string, string | null, boolean, number, string][]>`
    INSERT INTO tag_categories (name, description, sort_order)
    VALUES (${name}, ${description}, ${sortOrder})
    RETURNING category_id, name, description, is_active, sort_order, created_at
  `;

  const row = rows[0];
  if (row === undefined) return [new Error('Failed to create category'), null];

  return [null, {
    category_id: row[0],
    name: row[1],
    description: row[2],
    is_active: row[3],
    sort_order: row[4],
    created_at: row[5],
    tag_count: 0,
  }];
}

async function updateCategory(
  tx: postgres.Sql,
  categoryId: string,
  name: string | null,
  description: string | null,
  sortOrder: number | null,
): Promise<Result<CategoryRow>> {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  let pIdx = 1;

  if (name != null) { fields.push(`name = $${String(pIdx++)}`); params.push(name); }
  if (description != null) { fields.push(`description = $${String(pIdx++)}`); params.push(description); }
  if (sortOrder != null) { fields.push(`sort_order = $${String(pIdx++)}`); params.push(sortOrder); }

  if (fields.length === 0) return [new Error('No fields to update'), null];

  fields.push(`updated_at = NOW()`);
  params.push(categoryId);

  const query = `UPDATE tag_categories SET ${fields.join(', ')} WHERE category_id = $${String(pIdx)}::uuid RETURNING category_id, name, description, is_active, sort_order, created_at`;
  const rows = await tx.values<[string, string, string | null, boolean, number, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error('Category not found'), null];

  return [null, {
    category_id: row[0],
    name: row[1],
    description: row[2],
    is_active: row[3],
    sort_order: row[4],
    created_at: row[5],
    tag_count: 0,
  }];
}

async function toggleCategory(tx: postgres.Sql, categoryId: string, active: boolean): Promise<Result<{ readonly category_id: string; readonly is_active: boolean }>> {
  await tx`
    UPDATE tag_categories SET is_active = ${active}, updated_at = NOW()
    WHERE category_id = ${categoryId}::uuid
  `;
  return [null, { category_id: categoryId, is_active: active }];
}

async function deleteCategory(tx: postgres.Sql, categoryId: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM tag_categories WHERE category_id = ${categoryId}::uuid`;
  return [null, { deleted: true }];
}

// ─── Tag CRUD ───────────────────────────────────────────────────────────────

async function listTags(tx: postgres.Sql, categoryId?: string): Promise<Result<TagRow[]>> {
  let rows: [string, string, string, string, string | null, string, boolean, number, string][];

  if (categoryId != null) {
    rows = await tx.values<[string, string, string, string, string | null, string, boolean, number, string][]>`
      SELECT t.tag_id, t.category_id, tc.name AS category_name, t.name, t.description,
             t.color, t.is_active, t.sort_order, t.created_at
      FROM tags t
      JOIN tag_categories tc ON tc.category_id = t.category_id
      WHERE t.category_id = ${categoryId}::uuid
      ORDER BY t.sort_order ASC, t.name ASC
    `;
  } else {
    rows = await tx.values<[string, string, string, string, string | null, string, boolean, number, string][]>`
      SELECT t.tag_id, t.category_id, tc.name AS category_name, t.name, t.description,
             t.color, t.is_active, t.sort_order, t.created_at
      FROM tags t
      JOIN tag_categories tc ON tc.category_id = t.category_id
      ORDER BY tc.sort_order ASC, t.sort_order ASC, t.name ASC
    `;
  }

  const tags: TagRow[] = rows.map((row) => ({
    tag_id: row[0],
    category_id: row[1],
    category_name: row[2],
    name: row[3],
    description: row[4],
    color: row[5],
    is_active: row[6],
    sort_order: row[7],
    created_at: row[8],
  }));

  return [null, tags];
}

async function createTag(
  tx: postgres.Sql,
  categoryId: string,
  name: string,
  description: string | null,
  color: string,
  sortOrder: number,
): Promise<Result<TagRow>> {
  const rows = await tx.values<[string, string, string, string | null, string, boolean, number, string][]>`
    INSERT INTO tags (category_id, name, description, color, sort_order)
    VALUES (${categoryId}::uuid, ${name}, ${description}, ${color}, ${sortOrder})
    RETURNING tag_id, category_id, name, description, color, is_active, sort_order, created_at
  `;

  const row = rows[0];
  if (row === undefined) return [new Error('Failed to create tag'), null];

  return [null, {
    tag_id: row[0],
    category_id: row[1],
    category_name: '',
    name: row[2],
    description: row[3],
    color: row[4] ?? '',
    is_active: row[5],
    sort_order: row[6],
    created_at: row[7],
  }];
}

async function updateTag(
  tx: postgres.Sql,
  tagId: string,
  name: string | null,
  description: string | null,
  color: string | null,
  sortOrder: number | null,
  categoryId: string | null,
): Promise<Result<TagRow>> {
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  let pIdx = 1;

  if (name != null) { fields.push(`name = $${String(pIdx++)}`); params.push(name); }
  if (description != null) { fields.push(`description = $${String(pIdx++)}`); params.push(description); }
  if (color != null) { fields.push(`color = $${String(pIdx++)}`); params.push(color); }
  if (sortOrder != null) { fields.push(`sort_order = $${String(pIdx++)}`); params.push(sortOrder); }
  if (categoryId != null) { fields.push(`category_id = $${String(pIdx++)}::uuid`); params.push(categoryId); }

  if (fields.length === 0) return [new Error('No fields to update'), null];

  fields.push(`updated_at = NOW()`);
  params.push(tagId);

  const query = `UPDATE tags SET ${fields.join(', ')} WHERE tag_id = $${String(pIdx)}::uuid RETURNING tag_id, category_id, name, description, color, is_active, sort_order, created_at`;
  const rows = await tx.values<[string, string, string, string | null, string, boolean, number, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error('Tag not found'), null];

  return [null, {
    tag_id: row[0],
    category_id: row[1],
    category_name: '',
    name: row[2],
    description: row[3],
    color: row[4],
    is_active: row[5],
    sort_order: row[6],
    created_at: row[7],
  }];
}

async function toggleTag(tx: postgres.Sql, tagId: string, active: boolean): Promise<Result<{ readonly tag_id: string; readonly is_active: boolean }>> {
  await tx`UPDATE tags SET is_active = ${active}, updated_at = NOW() WHERE tag_id = ${tagId}::uuid`;
  return [null, { tag_id: tagId, is_active: active }];
}

async function deleteTag(tx: postgres.Sql, tagId: string): Promise<Result<{ readonly deleted: boolean }>> {
  await tx`DELETE FROM tags WHERE tag_id = ${tagId}::uuid`;
  return [null, { deleted: true }];
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function main(rawInput: unknown): Promise<Result<unknown>> {
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
  const tenantId = input.admin_user_id;

  try {
    const [txErr, txData] = await withTenantContext<unknown>(sql, tenantId, async (tx) => {
      // Verify admin
      const adminRows = await tx.values<[string][]>`
        SELECT role FROM users WHERE user_id = ${input.admin_user_id}::uuid AND is_active = true LIMIT 1
      `;
      const adminRow = adminRows[0];
      if (adminRow === undefined) return [new Error('Admin not found or inactive'), null];
      if (adminRow[0] !== 'admin') return [new Error('Forbidden: admin access required'), null];

      switch (input.action) {
        case 'list_categories':
          return listCategories(tx);

        case 'create_category': {
          const name = input.name;
          if (name == null) return [new Error('name is required'), null];
          return createCategory(tx, name, input.description ?? null, input.sort_order ?? 0);
        }

        case 'update_category': {
          const categoryId = input.category_id;
          if (categoryId == null) return [new Error('category_id is required'), null];
          return updateCategory(tx, categoryId, input.name ?? null, input.description ?? null, input.sort_order ?? null);
        }

        case 'delete_category': {
          const categoryId = input.category_id;
          if (categoryId == null) return [new Error('category_id is required'), null];
          return deleteCategory(tx, categoryId);
        }

        case 'activate_category': {
          const categoryId = input.category_id;
          if (categoryId == null) return [new Error('category_id is required'), null];
          return toggleCategory(tx, categoryId, true);
        }

        case 'deactivate_category': {
          const categoryId = input.category_id;
          if (categoryId == null) return [new Error('category_id is required'), null];
          return toggleCategory(tx, categoryId, false);
        }

        case 'list_tags':
          return listTags(tx, input.category_id ?? undefined);

        case 'create_tag': {
          const categoryId = input.category_id;
          const name = input.name;
          if (categoryId == null || name == null) return [new Error('category_id and name are required'), null];
          return createTag(tx, categoryId, name, input.description ?? null, input.color ?? '#808080', input.sort_order ?? 0);
        }

        case 'update_tag': {
          const tagId = input.tag_id;
          if (tagId == null) return [new Error('tag_id is required'), null];
          return updateTag(tx, tagId, input.name ?? null, input.description ?? null, input.color ?? null, input.sort_order ?? null, input.category_id ?? null);
        }

        case 'delete_tag': {
          const tagId = input.tag_id;
          if (tagId == null) return [new Error('tag_id is required'), null];
          return deleteTag(tx, tagId);
        }

        case 'activate_tag': {
          const tagId = input.tag_id;
          if (tagId == null) return [new Error('tag_id is required'), null];
          return toggleTag(tx, tagId, true);
        }

        case 'deactivate_tag': {
          const tagId = input.tag_id;
          if (tagId == null) return [new Error('tag_id is required'), null];
          return toggleTag(tx, tagId, false);
        }

        case 'list_all': {
          const [catErr, categories] = await listCategories(tx);
          if (catErr != null) return [catErr, null];
          const [tagErr, tags] = await listTags(tx);
          if (tagErr != null) return [tagErr, null];
          return [null, { categories: categories ?? [], tags: tags ?? [] }];
        }

        default: {
          const _exhaustive: never = input.action;
          return [new Error(`Unknown action: ${String(_exhaustive)}`), null];
        }
      }
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData as unknown];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
