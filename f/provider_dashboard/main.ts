/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Provider dashboard backend (schedule, bookings, overrides, stats)
 * DB Tables Used  : providers, provider_schedules, bookings, clients, services, schedule_overrides
 * Concurrency Risk: NO — read-heavy + single-row schedule overrides
 * GCal Calls      : NO
 * Idempotency Key : N/A — mostly read operations
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and parameters
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input with Zod schema covering 10 action types
 * - Route to appropriate handler via switch on action enum
 * - Each action performs its own DB queries: read (get_week, get_day_slots, list_*) or write (block_date, save_schedule, unblock_date)
 * - Block/unblock actions validate existing bookings before inserting schedule_overrides
 *
 * ### Schema Verification
 * - Tables: providers, provider_schedules, bookings, clients, services, schedule_overrides
 * - Columns: All verified against §6 + schedule_overrides (override_date, override_date_end, is_available)
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Missing required params for an action → early return with specific field requirements
 * - Scenario 2: getAvailability() or validateOverride() returns error → propagated to caller
 * - Scenario 3: save_schedule deletes then inserts — failure mid-operation leaves partial state → wrapped in withTenantContext transaction for rollback
 *
 * ### Concurrency Analysis
 * - Risk: YES for write actions (block_date, save_schedule) — schedule_overrides INSERT uses ON CONFLICT DO UPDATE; provider_schedules uses ON CONFLICT for idempotency
 * - Lock strategy: Transactional wrapping via withTenantContext; GIST exclusion on bookings prevents double-booking conflicts
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each case branch handles one action; switch dispatches cleanly
 * - DRY: YES — some booking map duplication across get_week and get_day_slots, but client detail inclusion differs
 * - KISS: YES — switch-based routing is the simplest correct pattern for multi-action dispatch
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// PROVIDER DASHBOARD API — Backend for provider dashboard frontend
// ============================================================================
// Actions: get_week, get_day_slots, block_date, unblock_date, save_schedule
// Returns real data from PostgreSQL via Windmill
// ============================================================================

import type { Result } from '../internal/result';
import { createDbClient } from '../internal/db/client';
import { withTenantContext } from '../internal/tenant-context';
import { InputSchema } from "./types";
import { getProvider, getWeek, getDaySlots, blockDate, unblockDate, saveSchedule, listServices, listOverrides, listSchedules } from './services';

export async function main(rawInput: unknown): Promise<[Error | null, Record<string, unknown> | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  // Admin dashboard requires explicit provider_id — no fallback
  if (input.provider_id == null) {
    return [new Error('provider_id is required'), null];
  }
  const tenantId = input.provider_id;

  try {
    const [txErr, txData] = await withTenantContext<unknown>(sql, tenantId, async (tx) => {
      const router: Record<string, () => Promise<Result<unknown>>> = {
        get_provider: () => getProvider(tx, input),
        get_week: () => getWeek(tx, input),
        get_day_slots: () => getDaySlots(tx, input),
        block_date: () => blockDate(tx, input),
        unblock_date: () => unblockDate(tx, input),
        save_schedule: () => saveSchedule(tx, input),
        list_services: () => listServices(tx, input),
        list_overrides: () => listOverrides(tx, input),
        list_schedules: () => listSchedules(tx, input),
      };

      const handler = router[input.action];
      if (!handler) {
        return [new Error(`Unknown action: ${input.action}`), null];
      }

      return handler();
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Dashboard query failed'), null];
    return [null, txData as Record<string, unknown> | null];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${message}`), null];
  } finally {
    await sql.end();
  }
}
