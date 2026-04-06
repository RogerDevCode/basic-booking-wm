// ============================================================================
// WEB ADMIN REGIONS — Read-only reference data for regions and communes
// ============================================================================
// Actions: list_regions, list_communes (by region), search_communes
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';

const ActionSchema = z.enum(['list_regions', 'list_communes', 'search_communes']);

const InputSchema = z.object({
  action: ActionSchema,
  region_id: z.number().int().optional(),
  search: z.string().max(100).optional(),
});

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  return postgres(url, { ssl: 'require' });
}

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

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };

  const input = parsed.data;
  const sql = getDb();

  try {
    if (input.action === 'list_regions') {
      const rows = await sql<RegionRow[]>`
        SELECT region_id, name, code, country_code, is_active, sort_order
        FROM regions WHERE is_active = true ORDER BY sort_order ASC, name ASC
      `;
      return { success: true, data: { regions: rows as RegionRow[], count: rows.length }, error_message: null };
    }

    if (input.action === 'list_communes') {
      const regionId = input.region_id;
      let rows;
      if (regionId != null) {
        rows = await sql<CommuneRow[]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND c.region_id = ${regionId}
          ORDER BY c.name ASC
        `;
      } else {
        rows = await sql<CommuneRow[]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true ORDER BY r.sort_order ASC, c.name ASC
        `;
      }
      return { success: true, data: { communes: rows as CommuneRow[], count: rows.length }, error_message: null };
    }

    if (input.action === 'search_communes') {
      const search = input.search ?? '';
      const regionId = input.region_id;
      let rows;
      if (regionId != null) {
        rows = await sql<CommuneRow[]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND c.region_id = ${regionId}
            AND LOWER(c.name) LIKE LOWER(${`%${search}%`})
          ORDER BY c.name ASC LIMIT 50
        `;
      } else {
        rows = await sql<CommuneRow[]>`
          SELECT c.commune_id, c.name, c.region_id, c.is_active, r.name AS region_name
          FROM communes c JOIN regions r ON r.region_id = c.region_id
          WHERE c.is_active = true AND LOWER(c.name) LIKE LOWER(${`%${search}%`})
          ORDER BY r.sort_order ASC, c.name ASC LIMIT 50
        `;
      }
      return { success: true, data: { communes: rows as CommuneRow[], count: rows.length }, error_message: null };
    }

    return { success: false, data: null, error_message: `Unknown action: ${input.action}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  } finally {
    await sql.end();
  }
}
