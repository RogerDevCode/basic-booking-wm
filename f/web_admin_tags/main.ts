/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Admin CRUD for tag categories and tags
 * DB Tables Used  : tag_categories, tags, users
 * Concurrency Risk: NO — simple CRUD on UUID rows
 * GCal Calls      : NO
 * Idempotency Key : N/A — admin write operations
 * RLS Tenant ID   : YES — withTenantContext enforces isolation
 * Zod Schemas     : YES — InputSchema validates all parameters
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Separate concerns: input validation, access control, and database operations.
 * - Refactor CRUD logic into a dedicated `TagRepository`.
 * - Clean up dynamic SQL building for UPDATE operations.
 * - Use idiomatic `postgres.js` typed results (tx<Row[]>) for better type safety.
 *
 * ### Schema Verification
 * - Tables: tag_categories, tags, users.
 * - Columns: category_id, name, description, is_active, sort_order, tag_id, color, role.
 *
 * ### Failure Mode Analysis
 * - Admin check failure: early return [Error, null] before any mutation.
 * - Missing parameters: Zod InputSchema catches them before reaching DB.
 * - Update without changes: Handled in update builders to avoid empty SET clauses.
 *
 * ### Concurrency Analysis
 * - Low risk; using `withTenantContext` ensures transactional integrity and RLS context.
 *
 * ### SOLID Compliance Check
 * - SRP: Logic split into specialized functions (access check, repository, orchestration).
 * - DRY: Common result pattern and row mapping handled consistently.
 * - KISS: Readable SQL without complex abstractions.
 *
 * → CLEARED FOR EXECUTION
 */

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ─── Input & Schema ─────────────────────────────────────────────────────────

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

type TagInput = Readonly<z.infer<typeof InputSchema>>;

// ─── Data Types ─────────────────────────────────────────────────────────────

interface CategoryRow {
  readonly category_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly is_active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
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
  readonly created_at: Date;
}

// ─── Access Control ──────────────────────────────────────────────────────────

/**
 * Ensures the requesting user has admin privileges.
 */
async function verifyAdminAccess(
  tx: postgres.Sql,
  userId: string
): Promise<Result<boolean>> {
  const rows = await tx<{ role: string }[]>`
    SELECT role FROM users
    WHERE user_id = ${userId}::uuid AND is_active = true
    LIMIT 1
  `;
  const user = rows[0];

  if (!user) return [new Error('UNAUTHORIZED: Admin user not found or inactive'), null];
  if (user.role !== 'admin') return [new Error('FORBIDDEN: Admin access required'), null];

  return [null, true];
}

// ─── Tag Repository ──────────────────────────────────────────────────────────

const TagRepository = {
  async listCategories(tx: postgres.Sql): Promise<Result<CategoryRow[]>> {
    const rows = await tx<CategoryRow[]>`
      SELECT tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at,
             COUNT(t.tag_id) FILTER (WHERE t.is_active = true)::int AS tag_count
      FROM tag_categories tc
      LEFT JOIN tags t ON t.category_id = tc.category_id
      GROUP BY tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at
      ORDER BY tc.sort_order ASC, tc.name ASC
    `;
    return [null, rows];
  },

  async createCategory(
    tx: postgres.Sql,
    params: { name: string; description: string | null; sort_order: number }
  ): Promise<Result<CategoryRow>> {
    const rows = await tx<CategoryRow[]>`
      INSERT INTO tag_categories (name, description, sort_order)
      VALUES (${params.name}, ${params.description}, ${params.sort_order})
      RETURNING category_id, name, description, is_active, sort_order, created_at, 0 as tag_count
    `;
    const row = rows[0];
    if (!row) return [new Error('DB_ERROR: Failed to create category'), null];
    return [null, row];
  },

  async updateCategory(
    tx: postgres.Sql,
    categoryId: string,
    updates: Partial<{ name: string; description: string | null; sort_order: number }>
  ): Promise<Result<CategoryRow>> {
    if (Object.keys(updates).length === 0) return [new Error('INVALID_INPUT: No fields to update'), null];

    const rows = await tx<CategoryRow[]>`
      UPDATE tag_categories SET ${tx(updates)}, updated_at = NOW()
      WHERE category_id = ${categoryId}::uuid
      RETURNING category_id, name, description, is_active, sort_order, created_at, 0 as tag_count
    `;
    const row = rows[0];
    if (!row) return [new Error('NOT_FOUND: Category not found'), null];
    return [null, row];
  },

  async setCategoryStatus(tx: postgres.Sql, categoryId: string, active: boolean): Promise<Result<{ category_id: string; is_active: boolean }>> {
    const rows = await tx<{ category_id: string; is_active: boolean }[]>`
      UPDATE tag_categories SET is_active = ${active}, updated_at = NOW()
      WHERE category_id = ${categoryId}::uuid
      RETURNING category_id, is_active
    `;
    if (!rows[0]) return [new Error('NOT_FOUND: Category not found'), null];
    return [null, rows[0]];
  },

  async deleteCategory(tx: postgres.Sql, categoryId: string): Promise<Result<{ deleted: boolean }>> {
    const result = await tx`DELETE FROM tag_categories WHERE category_id = ${categoryId}::uuid`;
    return [null, { deleted: result.count > 0 }];
  },

  async listTags(tx: postgres.Sql, categoryId?: string): Promise<Result<TagRow[]>> {
    const rows = await tx<TagRow[]>`
      SELECT t.tag_id, t.category_id, tc.name AS category_name, t.name, t.description,
             t.color, t.is_active, t.sort_order, t.created_at
      FROM tags t
      JOIN tag_categories tc ON tc.category_id = t.category_id
      ${categoryId ? tx`WHERE t.category_id = ${categoryId}::uuid` : tx``}
      ORDER BY tc.sort_order ASC, t.sort_order ASC, t.name ASC
    `;
    return [null, rows];
  },

  async createTag(
    tx: postgres.Sql,
    params: { category_id: string; name: string; description: string | null; color: string; sort_order: number }
  ): Promise<Result<TagRow>> {
    const rows = await tx<TagRow[]>`
      INSERT INTO tags (category_id, name, description, color, sort_order)
      VALUES (${params.category_id}::uuid, ${params.name}, ${params.description}, ${params.color}, ${params.sort_order})
      RETURNING tag_id, category_id, name, description, color, is_active, sort_order, created_at, (SELECT name FROM tag_categories WHERE category_id = ${params.category_id}::uuid) as category_name
    `;
    const row = rows[0];
    if (!row) return [new Error('DB_ERROR: Failed to create tag'), null];
    return [null, row];
  },

  async updateTag(
    tx: postgres.Sql,
    tagId: string,
    updates: Partial<{ name: string; description: string | null; color: string; sort_order: number; category_id: string }>
  ): Promise<Result<TagRow>> {
    if (Object.keys(updates).length === 0) return [new Error('INVALID_INPUT: No fields to update'), null];

    const rows = await tx<TagRow[]>`
      UPDATE tags SET ${tx(updates)}, updated_at = NOW()
      WHERE tag_id = ${tagId}::uuid
      RETURNING tag_id, category_id, name, description, color, is_active, sort_order, created_at, (SELECT name FROM tag_categories WHERE category_id = tags.category_id) as category_name
    `;
    const row = rows[0];
    if (!row) return [new Error('NOT_FOUND: Tag not found'), null];
    return [null, row];
  },

  async setTagStatus(tx: postgres.Sql, tagId: string, active: boolean): Promise<Result<{ tag_id: string; is_active: boolean }>> {
    const rows = await tx<{ tag_id: string; is_active: boolean }[]>`
      UPDATE tags SET is_active = ${active}, updated_at = NOW()
      WHERE tag_id = ${tagId}::uuid
      RETURNING tag_id, is_active
    `;
    if (!rows[0]) return [new Error('NOT_FOUND: Tag not found'), null];
    return [null, rows[0]];
  },

  async deleteTag(tx: postgres.Sql, tagId: string): Promise<Result<{ deleted: boolean }>> {
    const result = await tx`DELETE FROM tags WHERE tag_id = ${tagId}::uuid`;
    return [null, { deleted: result.count > 0 }];
  },
};

// ─── Orchestration ────────────────────────────────────────────────────────────

async function handleAction(
  tx: postgres.Sql,
  input: TagInput
): Promise<Result<unknown>> {
  // Step 1: Verify admin access (Boundary Security)
  const [accessErr] = await verifyAdminAccess(tx, input.admin_user_id);
  if (accessErr) return [accessErr, null];

  // Step 2: Route action
  switch (input.action) {
    case 'list_categories':
      return TagRepository.listCategories(tx);

    case 'create_category':
      if (!input.name) return [new Error('REQUIRED: name'), null];
      return TagRepository.createCategory(tx, {
        name: input.name,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
      });

    case 'update_category':
      if (!input.category_id) return [new Error('REQUIRED: category_id'), null];
      return TagRepository.updateCategory(tx, input.category_id, {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
      });

    case 'delete_category':
      if (!input.category_id) return [new Error('REQUIRED: category_id'), null];
      return TagRepository.deleteCategory(tx, input.category_id);

    case 'activate_category':
      if (!input.category_id) return [new Error('REQUIRED: category_id'), null];
      return TagRepository.setCategoryStatus(tx, input.category_id, true);

    case 'deactivate_category':
      if (!input.category_id) return [new Error('REQUIRED: category_id'), null];
      return TagRepository.setCategoryStatus(tx, input.category_id, false);

    case 'list_tags':
      return TagRepository.listTags(tx, input.category_id);

    case 'create_tag':
      if (!input.category_id || !input.name) return [new Error('REQUIRED: category_id, name'), null];
      return TagRepository.createTag(tx, {
        category_id: input.category_id,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? '#808080',
        sort_order: input.sort_order ?? 0,
      });

    case 'update_tag':
      if (!input.tag_id) return [new Error('REQUIRED: tag_id'), null];
      return TagRepository.updateTag(tx, input.tag_id, {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.color && { color: input.color }),
        ...(input.sort_order !== undefined && { sort_order: input.sort_order }),
        ...(input.category_id && { category_id: input.category_id }),
      });

    case 'delete_tag':
      if (!input.tag_id) return [new Error('REQUIRED: tag_id'), null];
      return TagRepository.deleteTag(tx, input.tag_id);

    case 'activate_tag':
      if (!input.tag_id) return [new Error('REQUIRED: tag_id'), null];
      return TagRepository.setTagStatus(tx, input.tag_id, true);

    case 'deactivate_tag':
      if (!input.tag_id) return [new Error('REQUIRED: tag_id'), null];
      return TagRepository.setTagStatus(tx, input.tag_id, false);

    case 'list_all': {
      const [catErr, categories] = await TagRepository.listCategories(tx);
      if (catErr) return [catErr, null];
      const [tagErr, tags] = await TagRepository.listTags(tx);
      if (tagErr) return [tagErr, null];
      return [null, { categories: categories ?? [], tags: tags ?? [] }];
    }

    default: {
      const _exhaustive: never = input.action;
      return [new Error(`UNKNOWN_ACTION: ${String(_exhaustive)}`), null];
    }
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Main Windmill entry point for web_admin_tags.
 */
export async function main(rawInput: unknown): Promise<Result<unknown>> {
  // 1. Validate Input (Zod)
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`VALIDATION_ERROR: ${parsed.error.message}`), null];
  }
  const input: TagInput = parsed.data;

  // 2. Setup Infrastructure
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    // 3. Execute with Multi-Tenant RLS Context
    return await withTenantContext(sql, input.admin_user_id, async (tx) => {
      return handleAction(tx, input);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return [new Error(`SYSTEM_ERROR: ${message}`), null];
  } finally {
    // 4. Resource Management
    await sql.end();
  }
}
