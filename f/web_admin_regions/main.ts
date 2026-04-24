//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Read-only reference data for regions and communes
 * DB Tables Used  : regions, communes
 * Concurrency Risk: NO — read-only reference queries
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : NO — read-only reference tables
 * Zod Schemas     : YES — InputSchema validates action and region_id
 */

import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input } from './types.ts';
import { listRegions, listCommunes, searchCommunes } from './services.ts';

export async function main(args: any) : Promise<Result<unknown>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    if (input.action === 'list_regions') {
      return await listRegions(sql);
    }

    if (input.action === 'list_communes') {
      return await listCommunes(sql, input.region_id);
    }

    if (input.action === 'search_communes') {
      return await searchCommunes(sql, input.search ?? '', input.region_id);
    }

    return [new Error(`Unknown action: ${String(input.action)}`), null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}