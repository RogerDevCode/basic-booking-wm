//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Renew expiring Google Calendar push notification channel
 * DB Tables Used  : providers (to read calendar_id)
 * Concurrency Risk: NO — single-row read per provider
 * GCal Calls      : YES — stop old channel + register new channel
 * Idempotency Key : N/A — channel registration is inherently idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates channel_id and resource_id
 */

import { InputSchema, type Input, type RenewResult } from './types.ts';
import { renewChannel } from './services.ts';
import type { Result } from '../internal/result/index.ts';

export async function main(args: any) : Promise<Result<RenewResult>> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  return renewChannel(input);
}