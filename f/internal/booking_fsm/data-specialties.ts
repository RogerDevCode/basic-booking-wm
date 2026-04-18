/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Query active services (specialties) for the booking wizard
 * DB Tables Used  : services (service_id, name, is_active, duration_minutes)
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
import type { Result } from '../result';

const ServiceRowSchema = z.object({
  service_id: z.uuid(),
  name: z.string().min(1),
  duration_minutes: z.number().int().positive(),
});

export type ServiceRow = z.infer<typeof ServiceRowSchema>;

export interface FetchSpecialtiesResult {
  readonly specialties: readonly { id: string; name: string }[];
}

/**
 * fetchSpecialties — Returns active services for the current tenant.
 * The sql client must already be inside withTenantContext.
 * 
 * SOLID Implementation:
 * - SRP: Focused exclusively on specialty data retrieval and mapping.
 * - OCP: Query is encapsulated, allowing for extension of filters if needed.
 * - DIP: Depends on Result<T> for standardized error handling.
 */
export async function fetchSpecialties(
  sql: postgres.Sql,
): Promise<Result<FetchSpecialtiesResult>> {
  /**
   * REASONING TRACE
   * STEP 1 — DECOMPOSITION: Query services -> Validate -> Map to FetchSpecialtiesResult.
   * STEP 2 — SCHEMA CROSS-CHECK: Checked 'services' table in §6.
   * STEP 3 — FAILURE MODE ANALYSIS: Handled DB errors and Zod validation failures.
   * STEP 4 — CONCURRENCY: Read-only, no locks needed.
   * STEP 5 — SOLID: SRP via focused function; KISS via direct SQL; DIP via Result<T>.
   */

  try {
    // 1. Fetch active services ordered by name
    // RLS ensures we only see services for the current tenantId
    const rows = await sql`
      SELECT service_id, name, duration_minutes
      FROM services
      WHERE is_active = true
      ORDER BY name ASC
    `;

    // 2. Validate DB response structure
    const validated = z.array(ServiceRowSchema).safeParse(rows);
    if (!validated.success) {
      return [new Error(`invalid_service_rows: ${validated.error.message}`), null];
    }

    // 3. Transform to FSM-compatible specialty format
    const specialties = validated.data.map(r => ({
      id: r.service_id,
      name: r.name,
    }));

    return [null, { specialties }];

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`fetch_specialties_failed: ${msg}`), null];
  }
}
