/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query active services (specialties) for the booking wizard
 * DB Tables Used  : services (service_id, name, provider_id, is_active, duration_minutes)
 * Concurrency Risk: NO — read-only query
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only
 * RLS Tenant ID   : YES — query runs within withTenantContext
 * Zod Schemas     : YES — output validated
 */

// ============================================================================
// BOOKING FSM — Data: Specialties / Services
// ============================================================================
// Fetches active services from the DB for the specialty selection step.
// Caller must provide a SQL client that is already within a tenant context.
// ============================================================================

import { z } from 'zod';
import type postgres from 'postgres';

const ServiceRowSchema = z.object({
  service_id: z.string(),
  name: z.string(),
  duration_minutes: z.number().int().positive(),
});

export type ServiceRow = z.infer<typeof ServiceRowSchema>;

export interface FetchSpecialtiesResult {
  readonly specialties: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * fetchSpecialties — Returns active services for the current tenant.
 * The sql client must already be inside withTenantContext.
 */
export async function fetchSpecialties(
  sql: postgres.Sql,
): Promise<[Error | null, FetchSpecialtiesResult | null]> {
  try {
    const rows = await sql`
      SELECT service_id, name, duration_minutes
      FROM services
      WHERE is_active = true
      ORDER BY name ASC
    `;

    const validated = z.array(ServiceRowSchema).safeParse(rows);
    if (!validated.success) {
      return [new Error(`Invalid service rows: ${validated.error.message}`), null];
    }

    return [null, {
      specialties: validated.data.map(r => ({ id: r.service_id, name: r.name })),
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`fetch_specialties_failed: ${msg}`), null];
  }
}
