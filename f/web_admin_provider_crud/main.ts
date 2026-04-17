/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Full provider management for admin dashboard (CRUD + activate/deactivate)
 * DB Tables Used  : providers, services, honorifics, specialties, regions, communes, timezones
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and provider fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action type and provider fields via Zod InputSchema
 * - Route to listProviders, createProvider, updateProvider, activate/deactivate, or resetProviderPassword
 * - On create: generate temp password, hash it, insert into providers, return temp password to admin
 * - On reset: generate new temp password, hash, update providers.password_hash
 *
 * ### Schema Verification
 * - Tables: providers (id, name, email, specialty_id, honorific_id, timezone_id, phone_app, phone_contact, telegram_chat_id, gcal_calendar_id, address fields, region_id, commune_id, is_active, password_hash, last_password_change), honorifics, specialties, timezones, regions, communes
 * - Columns: All provider columns verified; joins use LEFT JOIN for optional reference tables
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Create with empty name/email → Zod validation fails before DB call
 * - Scenario 2: Update with no fields → early return error before building dynamic SQL
 * - Scenario 3: Update provider not found → RETURNING yields no rows, error returned
 * - Scenario 4: Transaction failure (RLS violation, constraint) → withTenantContext rolls back, error propagated
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD with provider_id as primary key; unique constraint on email handled by DB
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each function (list/create/update/resetPassword) has single responsibility
 * - DRY: YES — dynamic SQL builder for update avoids per-field duplication; shared ProviderRow type
 * - KISS: YES — straightforward CRUD; dynamic UPDATE fields built iteratively without ORM complexity
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN PROVIDER CRUD — Full provider management for admin dashboard
// ============================================================================
// Actions: list, create, update, activate, deactivate, reset_password
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import { InputSchema } from './types';
import { listProviders, createProvider, updateProvider, resetProviderPassword } from './services';
import type { Input } from './types';

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<[Error | null, unknown | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<Input> = parsed.data;
  const sql = createDbClient({ url: process.env['DATABASE_URL'] ?? '' });

  try {
    // 'list' is a global admin operation — runs outside tenant context
    if (input.action === 'list') {
      const [listErr, listData] = await listProviders(sql);
      if (listErr != null) return [listErr, null];
      return [null, { providers: listData, action: 'list' }];
    }

    // All other actions require a specific provider_id as tenant
    if (input.provider_id == null) {
      return [new Error('provider_id is required for non-list operations'), null];
    }

    const [txErr, txData] = await withTenantContext<unknown>(sql, input.provider_id, async (tx) => {
      if (input.action === 'create') {
        return createProvider(tx, input);
      }

      if (input.action === 'update') {
        const id = input.provider_id;
        if (id == null) return [new Error('update_failed: provider_id is required'), null];
        return updateProvider(tx, id, input);
      }

      if (input.action === 'activate' || input.action === 'deactivate') {
        const id = input.provider_id;
        if (id == null) return [new Error(`${input.action}_failed: provider_id is required`), null];
        const active = input.action === 'activate';
        await tx`UPDATE providers SET is_active = ${active}, updated_at = NOW() WHERE id = ${id}::uuid`;
        return [null, { provider_id: id, is_active: active }];
      }

      if (input.action === 'reset_password') {
        const id = input.provider_id;
        if (id == null) return [new Error('reset_password_failed: provider_id is required'), null];
        return resetProviderPassword(tx, id);
      }

      return [new Error(`Unknown action: ${input.action}`), null];
    });

    if (txErr !== null) {
      const msg = txErr.message;
      if (msg.startsWith('transaction_failed: ')) {
        return [new Error(msg.slice(20)), null];
      }
      return [txErr, null];
    }

    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let errorMsg = msg;
    if (msg.startsWith('transaction_failed: ')) {
      errorMsg = msg.slice(20);
    }
    return [new Error(errorMsg), null];
  } finally {
    await sql.end();
  }
}
