/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Register Google Calendar push notification channel
 * DB Tables Used  : NONE
 * Concurrency Risk: NO
 * GCal Calls      : YES — register new webhook channel
 * Idempotency Key : YES — UUID-based channel ID
 * RLS Tenant ID   : NO — Pure API integration
 * Zod Schemas     : YES — InputSchema validation
 */

import { InputSchema, type Input, type WebhookSetupResult } from './types';
import { setupWebhook } from './services';
import type { Result } from '../internal/result/index';

export async function main(rawInput: unknown): Promise<Result<WebhookSetupResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  return setupWebhook(input);
}