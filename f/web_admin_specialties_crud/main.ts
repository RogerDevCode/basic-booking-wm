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
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context/index';
import type { Result } from '../internal/result/index';
import { InputSchema } from './types';
import { Handlers } from './services';

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
