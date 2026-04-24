//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Log messages to conversations table (incoming/outgoing)
 * DB Tables Used  : conversations
 * Concurrency Risk: NO — single-row INSERT
 * GCal Calls      : NO
 * Idempotency Key : N/A — log entries are inherently non-idempotent
 * RLS Tenant ID   : YES — inserts provider_id as tenant context
 * Zod Schemas     : YES — InputSchema validates channel, direction, content
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type LogResult } from './types.ts';
import { persistLog } from './services.ts';

export async function main(args: any) : Promise<Result<LogResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }
  const input = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('config_error: DATABASE_URL is missing'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(
      sql,
      input.provider_id,
      async (tx) => persistLog(tx, input)
    );

    if (txErr !== null) {
      return [txErr, null];
    }

    if (txData === null) {
      return [new Error('orchestration_error: Data returned from transaction was null'), null];
    }

    return [null, txData];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [new Error(`orchestration_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}