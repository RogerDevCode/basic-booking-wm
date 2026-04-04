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

const InputSchema = z.object({
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

async function getDefaultServiceId(sql: postgres.Sql, providerId: string): Promise<string | null> {
  const rows = await sql`
    SELECT service_id FROM services WHERE provider_id = ${providerId}::uuid AND is_active = true LIMIT 1
  `;
  const firstRow = rows[0];
  return firstRow != null ? String(firstRow['service_id']) : null;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: AvailabilityResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { provider_id, date, service_id } = parsed.data;

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return { success: false, data: null, error_message: 'DATABASE_URL not configured' };
    }

    const sql = postgres(dbUrl, { ssl: 'require' });

    try {
      // Step 1: Get provider info (typed query)
      const [provider] = await sql<ProviderRow[]>`
        SELECT provider_id, name, timezone FROM providers
        WHERE provider_id = ${provider_id}::uuid AND is_active = true
        LIMIT 1
      `;

      if (!provider) {
        return { success: false, data: null, error_message: `Provider ${provider_id} not found or inactive` };
      }

      // Step 2: Use scheduling engine for availability computation
      const effectiveServiceId = service_id ?? (await getDefaultServiceId(sql, provider_id));
      if (effectiveServiceId == null) {
        return { success: false, data: null, error_message: 'No services available for this provider' };
      }

      const [err, result] = await getAvailability(sql, {
        provider_id,
        date,
        service_id: effectiveServiceId,
      });

      if (err != null) {
        return { success: false, data: null, error_message: `Scheduling error: ${err.message}` };
      }

      if (result == null) {
        return { success: false, data: null, error_message: 'No availability data returned' };
      }

      return {
        success: true,
        data: {
          provider_id,
          provider_name: provider.name,
          date: result.date,
          timezone: provider.timezone,
          slots: result.slots,
          total_available: result.total_available,
          total_booked: result.total_booked,
          is_blocked: result.is_blocked,
          block_reason: result.block_reason ?? undefined,
        },
        error_message: null,
      };
    } finally {
      await sql.end();
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
