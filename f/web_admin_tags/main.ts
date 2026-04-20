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

import { withTenantContext } from '../internal/tenant-context/index';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result/index';
import { InputSchema, type TagInput } from './types';
import { handleAction } from './services';

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
