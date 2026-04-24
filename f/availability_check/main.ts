//nobundling
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

import { getAvailability } from '../internal/scheduling-engine/index.ts';
import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type AvailabilityResult } from './types.ts';
import { getProviderServiceId, getProvider } from './services.ts';

export async function main(args: any) : Promise<Result<AvailabilityResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  const { tenant_id, provider_id, date, service_id } = input;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('DATABASE_URL not configured'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const [err, result] = await withTenantContext(sql, tenant_id, async (tx) => {
    const provider = await getProvider(tx, provider_id);
    if (!provider) {
      return [new Error(`Provider ${provider_id} not found or inactive`), null];
    }

    const effectiveServiceId = service_id ?? (await getProviderServiceId(tx, provider_id));
    if (effectiveServiceId == null) {
      return [new Error('No services available for this provider'), null];
    }

    const [schedErr, schedResult] = await getAvailability(tx, {
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