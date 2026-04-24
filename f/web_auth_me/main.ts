//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Get current user profile + role by user_id
 * DB Tables Used  : users
 * Concurrency Risk: NO — read-only single-row SELECT
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only operation
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates user_id
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type UserProfileResult } from './types.ts';
import { getUserProfile } from './services.ts';

export async function main(args: any) : Promise<Result<UserProfileResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const { user_id } = input;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, user_id, async (tx) => {
      return getUserProfile(tx, user_id);
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('User not found'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}