//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : System health monitoring (DB, GCal, Telegram, Gmail)
 * DB Tables Used  : NONE — simple connectivity check (SELECT 1)
 * Concurrency Risk: NO — read-only health probes
 * GCal Calls      : YES — health probe to GCal API
 * Idempotency Key : N/A — read-only health check
 * RLS Tenant ID   : NO — infrastructure check
 * Zod Schemas     : YES — InputSchema validates optional component filter
 */

import type { Result } from '../internal/result/index.ts';
import { InputSchema, type Input, type ComponentStatus } from './types.ts';
import { checkDatabase, checkGCal, checkTelegram } from './services.ts';

export async function main(args: any): Promise<Result<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: ComponentStatus[];
}>> {
  const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  const gcalToken = process.env['GCAL_ACCESS_TOKEN'];
  const telegramToken = process.env['TELEGRAM_BOT_TOKEN'];

  const components: ComponentStatus[] = [];

  if (input.component === 'all' || input.component === 'database') {
    if (dbUrl !== undefined && dbUrl !== '') {
      components.push(await checkDatabase(dbUrl));
    } else {
      components.push({ component: 'database', status: 'not_configured', latency_ms: 0, message: 'DATABASE_URL not set' });
    }
  }

  if (input.component === 'all' || input.component === 'gcal') {
    components.push(await checkGCal(gcalToken ?? ''));
  }

  if (input.component === 'all' || input.component === 'telegram') {
    components.push(await checkTelegram(telegramToken ?? ''));
  }

  const hasUnhealthy = components.some(function(c: ComponentStatus): boolean { return c.status === 'unhealthy'; });
  const hasDegraded = components.some(function(c: ComponentStatus): boolean { return c.status === 'degraded'; });
  const overall: 'healthy' | 'degraded' | 'unhealthy' = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

  return [null, {
    overall: overall,
    timestamp: new Date().toISOString(),
    components: components,
  }];
}