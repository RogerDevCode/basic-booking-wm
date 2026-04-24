//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Auto-register user from Telegram webhook payload
 * DB Tables Used  : clients
 * Concurrency Risk: NO — UPSERT by telegram_chat_id
 * GCal Calls      : NO
 * Idempotency Key : YES — ON CONFLICT (telegram_chat_id) DO NOTHING
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates Telegram webhook structure
 */

import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type RegisterResult } from './types.ts';
import { registerTelegramUser } from './services.ts';

export async function main(args: any) : Promise<Result<RegisterResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const reserved = await sql.reserve();
    try {
      await reserved`BEGIN`;
      const [err, data] = await registerTelegramUser(reserved, input);
      if (err !== null) { await reserved`ROLLBACK`; return [err, null]; }
      await reserved`COMMIT`;
      return [null, data];
    } catch (error: unknown) {
      await reserved`ROLLBACK`.catch(() => { /* ignore */ });
      const msg = error instanceof Error ? error.message : String(error);
      return [new Error(`transaction_failed: ${msg}`), null];
    } finally {
      reserved.release();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}