/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query active doctors/providers for a given specialty
 * DB Tables Used  : providers, specialties
 * Concurrency Risk: NO — read-only query
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only
 * RLS Tenant ID   : YES — query runs within withTenantContext
 * Zod Schemas     : YES — output validated
 */

// ============================================================================
// BOOKING FSM — Data: Doctors / Providers
// ============================================================================
// Fetches active providers for a given specialty.
// Caller must provide a SQL client that is already within a tenant context.
// ============================================================================

import { z } from 'zod';
import type postgres from 'postgres';

const ProviderRowSchema = z.object({
  provider_id: z.string(),
  name: z.string(),
});

export type ProviderRow = z.infer<typeof ProviderRowSchema>;

export interface FetchDoctorsResult {
  readonly doctors: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * fetchDoctors — Returns active providers for a given specialty.
 * The sql client must already be inside withTenantContext.
 * If specialtyName is null/empty, returns all active providers.
 */
export async function fetchDoctors(
  sql: postgres.Sql,
  specialtyName: string | null,
): Promise<[Error | null, FetchDoctorsResult | null]> {
  try {
    let rows: ProviderRow[];

    if (specialtyName !== null && specialtyName.length > 0) {
      rows = await sql`
        SELECT provider_id, name
        FROM providers
        WHERE is_active = true
          AND (
            specialty = ${specialtyName}
            OR LOWER(name) LIKE LOWER('%' || ${specialtyName} || '%')
          )
        ORDER BY name ASC
      `;
    } else {
      rows = await sql`
        SELECT provider_id, name
        FROM providers
        WHERE is_active = true
        ORDER BY name ASC
      `;
    }

    const validated = z.array(ProviderRowSchema).safeParse(rows);
    if (!validated.success) {
      return [new Error(`Invalid provider rows: ${validated.error.message}`), null];
    }

    return [null, {
      doctors: validated.data.map(r => ({ id: r.provider_id, name: r.name })),
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`fetch_doctors_failed: ${msg}`), null];
  }
}
