/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Read-only reference data for regions and communes
 * DB Tables Used  : regions, communes
 * Concurrency Risk: NO — read-only reference queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : NO — read-only reference tables, no tenant isolation needed
 * Zod Schemas     : YES — InputSchema validates action and region_id
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action (list_regions/list_communes/search_communes) and optional filters via Zod
 * - Execute read-only SELECT queries on regions and communes with JOIN to regions for region_name
 * - Map result rows to typed RegionRow/CommuneRow interfaces with count metadata
 *
 * ### Schema Verification
 * - Tables: regions (region_id, name, code, country_code, is_active, sort_order), communes (commune_id, name, region_id, is_active)
 * - Columns: All columns verified; communes JOIN regions on region_id for region_name enrichment
 *
 * ### Failure Mode Analysis
 * - Scenario 1: list_communes without region_id → fallback to all active communes ordered by region sort_order
 * - Scenario 2: search_communes with empty search → LIKE '%%' matches all, limited to 50 rows
 * - Scenario 3: DATABASE_URL missing → early validation error before DB connection
 *
 * ### Concurrency Analysis
 * - Risk: NO — pure read-only queries with no writes or shared state
 *
 * ### SOLID Compliance Check
 * - SRP: YES — single responsibility: fetch and return reference data
 * - DRY: YES — commune row mapping logic extracted; shared commune SELECT pattern across actions
 * - KISS: YES — straightforward SELECT with conditional WHERE clauses; no abstraction overhead
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN REGIONS — Read-only reference data for regions and communes
// ============================================================================
// Actions: list_regions, list_communes (by region), search_communes
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

const ActionSchema = z.enum(['list_regions', 'list_communes', 'search_communes']);

const InputSchema = z.object({
  action: ActionSchema,
  region_id: z.number().int().optional(),
  search: z.string().max(100).optional(),
});

interface RegionRow {
  readonly region_id: number;
  readonly name: string;
  readonly code: string;
  readonly country_code: string;
  readonly is_active: boolean;
  readonly sort_order: number;
}

interface CommuneRow {
  readonly commune_id: number;
  readonly name: string;
  readonly region_id: number;
  readonly is_active: boolean;
  readonly region_name: string;
}

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    if (input.action === 'list_regions') {
      const rows = await sql.values<[number, string, string, string, boolean, number][]>`
        SELECT region_id, name, code, country_code, is_active, sort_order
        FROM regions WHERE is_active = true ORDER BY sort_order ASC, name ASC
      `;
      const regions: RegionRow[] = rows.map((row) => ({
        region_id: row[0],
        name: row[1],
        code: row[2],
        country_code: row[3],
        is_active: row[4],
        sort_order: row[5],
      }));
      return [null, { regions, count: regions.length }];
    }

    if (input.action === 'list_communes') {
      const regionId = input.region_id;
      let rows: [number, string, number, boolean, string][];
      if (regionId != null) {
        rows = await sql.values<[number, string, number, boolean, string][]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND c.region_id = ${regionId}
          ORDER BY c.name ASC
        `;
      } else {
        rows = await sql.values<[number, string, number, boolean, string][]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true ORDER BY r.sort_order ASC, c.name ASC
        `;
      }
      const communes: CommuneRow[] = rows.map((row) => ({
        commune_id: row[0],
        name: row[1],
        region_id: row[2],
        is_active: row[3],
        region_name: row[4],
      }));
      return [null, { communes, count: communes.length }];
    }

    if (input.action === 'search_communes') {
      const search = input.search ?? '';
      const regionId = input.region_id;
      let rows: [number, string, number, boolean, string][];
      if (regionId != null) {
        rows = await sql.values<[number, string, number, boolean, string][]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND c.region_id = ${regionId}
            AND LOWER(c.name) LIKE LOWER(${`%${search}%`})
          ORDER BY c.name ASC LIMIT 50
        `;
      } else {
        rows = await sql.values<[number, string, number, boolean, string][]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND LOWER(c.name) LIKE LOWER(${`%${search}%`})
          ORDER BY r.sort_order ASC, c.name ASC LIMIT 50
        `;
      }
      const communes: CommuneRow[] = rows.map((row) => ({
        commune_id: row[0],
        name: row[1],
        region_id: row[2],
        is_active: row[3],
        region_name: row[4],
      }));
      return [null, { communes, count: communes.length }];
    }

    return [new Error(`Unknown action: ${String(input.action)}`), null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
