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

async function getDefaultServiceId(tx: postgres.TransactionSql, providerId: string): Promise<string | null> {
  const rows = await tx`
    SELECT service_id FROM provider_services
    WHERE provider_id = ${providerId}::uuid AND is_default = true
    LIMIT 1
  `;
  return rows[0]?.service_id ?? null;
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
