/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Get available time slots for a provider on a given date
 * DB Tables Used  : providers, provider_schedules, schedule_overrides, bookings, provider_services
 * Concurrency Risk: NO — read-only queries, no locks needed
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates all inputs
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate inputs (tenant_id, provider_id, date, optional service_id)
 * - Query provider info to confirm active status and retrieve timezone
 * - Delegate to scheduling engine (getAvailability) for slot computation
 * - Return structured availability result with metadata
 *
 * ### Schema Verification
 * - Tables: providers (provider_id, name, timezone, is_active), provider_services (service_id, provider_id, is_default), provider_schedules (via getAvailability), bookings (via getAvailability)
 * - Columns: All verified against §6 schema; provider_services and schedule_overrides are extension tables used by scheduling engine
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Provider not found or inactive → return error before scheduling engine call
 * - Scenario 2: No default service for provider → return error with clear message
 * - Scenario 3: getAvailability returns null → return error to prevent silent failure
 *
 * ### Concurrency Analysis
 * - Risk: NO — read-only queries, no locks needed
 *
 * ### SOLID Compliance Check
 * - SRP: Each function does one thing — YES (main orchestrates, getDefaultServiceId fetches service, withTenantContext manages transaction)
 * - DRY: No duplicated logic — YES (delegates to getAvailability, uses shared tenant-context HOF)
 * - KISS: No unnecessary complexity — YES (straightforward delegation pattern)
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// AVAILABILITY CHECK — Get available time slots for a provider on a date
// ============================================================================
// Returns all bookable time slots for a provider on a given date:
// 1. Checks provider schedule for day-of-week
// 2. Checks for schedule overrides (blocked, modified hours)
// 3. Generates slots based on service duration + buffer
// 4. Removes slots that overlap with existing bookings
// 5. Returns available slots with metadata
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { getAvailability } from '../internal/scheduling-engine';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  tenant_id: z.uuid(),
  provider_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  service_id: z.uuid().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
});

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

interface AvailabilityResult {
  provider_id: string;
  provider_name: string;
  date: string;
  timezone: string;
  slots: readonly TimeSlot[];
  total_available: number;
  total_booked: number;
  is_blocked: boolean;
  block_reason: string | undefined;
}

// Typed row interfaces for postgres queries — avoids index signature issues
interface ProviderRow {
  provider_id: string;
  name: string;
  timezone: string;
}

async function getDefaultServiceId(tx: postgres.Sql, providerId: string): Promise<string | null> {
  const rows = await tx<{ service_id: string }[]>`
    SELECT service_id FROM provider_services
    WHERE provider_id = ${providerId}::uuid AND is_default = true
    LIMIT 1
  `;
  const first = rows[0];
  if (first === undefined) return null;
  return first.service_id;
}

export async function main(rawInput: unknown): Promise<[Error | null, AvailabilityResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const { tenant_id, provider_id, date, service_id } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const [err, result] = await withTenantContext(sql, tenant_id, async (tx) => {
    // Step 1: Get provider info (typed query)
    const [provider] = await tx<ProviderRow[]>`
      SELECT provider_id, name, timezone FROM providers
      WHERE provider_id = ${provider_id}::uuid AND is_active = true
      LIMIT 1
    `;

    if (!provider) {
      return [new Error(`Provider ${provider_id} not found or inactive`), null];
    }

    // Step 2: Use scheduling engine for availability computation
    const effectiveServiceId = service_id ?? (await getDefaultServiceId(tx, provider_id));
    if (effectiveServiceId == null) {
      return [new Error('No services available for this provider'), null];
    }

    const [schedErr, schedResult] = await getAvailability(tx as postgres.Sql, {
      provider_id,
      date,
      service_id: effectiveServiceId,
    });

    if (schedErr != null) {
      return [schedErr, null];
    }

    if (schedResult == null) {
      return [new Error('No availability data returned'), null];
    }

    return [null, {
      provider_id,
      provider_name: provider.name,
      date: schedResult.date,
      timezone: provider.timezone,
      slots: schedResult.slots,
      total_available: schedResult.total_available,
      total_booked: schedResult.total_booked,
      is_blocked: schedResult.is_blocked,
      block_reason: schedResult.block_reason ?? undefined,
    }];
  });

  if (err !== null) return [err, null];
  return [null, result];
}
