/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query active doctors/providers for a given specialty
 * DB Tables Used  : providers
 * Concurrency Risk: NO — read-only query
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only
 * RLS Tenant ID   : YES — query runs within withTenantContext
 * Zod Schemas     : YES — output validated
 */

import { z } from 'zod';
import type postgres from 'postgres';
import type { Result } from '../result';

// ============================================================================
// BOOKING FSM — Data: Doctors / Providers
// ============================================================================
// Fetches active providers for a given specialty.
// Caller must provide a SQL client that is already within a tenant context.
// ============================================================================

const ProviderRowSchema = z.object({
  provider_id: z.string().uuid(),
  name: z.string(),
});

export type ProviderRow = z.infer<typeof ProviderRowSchema>;

export interface FetchDoctorsResult {
  readonly doctors: readonly { id: string; name: string }[];
}

/**
 * fetchDoctors — Returns active providers for a given specialty.
 * The sql client must already be inside withTenantContext.
 * If specialtyName is null/empty, returns all active providers.
 */
export async function fetchDoctors(
  sql: postgres.Sql,
  specialtyName: string | null,
): Promise<Result<FetchDoctorsResult>> {
  const [queryErr, rows] = await queryProviders(sql, specialtyName);
  if (queryErr !== null) {
    return [queryErr, null];
  }

  return mapProvidersToResult(rows ?? []);
}

/**
 * queryProviders — Private helper to fetch raw rows and validate them.
 * SRP: Responsibility is ONLY fetching and initial schema validation.
 */
async function queryProviders(
  sql: postgres.Sql,
  specialtyName: string | null,
): Promise<Result<ProviderRow[]>> {
  try {
    const queryValue = specialtyName?.trim() ?? "";
    
    // Execute query based on specialty filter
    const rows = await (queryValue.length > 0
      ? sql`
        SELECT provider_id, name
        FROM providers
        WHERE is_active = true
          AND (
            specialty = ${queryValue}
            OR LOWER(name) LIKE LOWER('%' || ${queryValue} || '%')
          )
        ORDER BY name ASC
      `
      : sql`
        SELECT provider_id, name
        FROM providers
        WHERE is_active = true
        ORDER BY name ASC
      `);

    const validated = z.array(ProviderRowSchema).safeParse(rows);
    if (!validated.success) {
      return [new Error(`fetch_doctors_validation_failed: ${validated.error.message}`), null];
    }

    return [null, validated.data];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`fetch_doctors_query_failed: ${msg}`), null];
  }
}

/**
 * mapProvidersToResult — Private helper to format rows for the domain.
 * SRP: Responsibility is ONLY data transformation.
 */
function mapProvidersToResult(rows: readonly ProviderRow[]): Result<FetchDoctorsResult> {
  // Transformation is simple but encapsulated for SOLID alignment
  const doctors = rows.map(r => ({
    id: r.provider_id,
    name: r.name,
  }));

  return [null, { doctors }];
}
