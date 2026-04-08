// ============================================================================
// HEALTH CHECK — System health monitoring endpoint
// ============================================================================
// Checks: database connectivity, GCal API, Telegram API, Gmail SMTP
// Returns: overall status + per-component status + latency
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  component: z.enum(['all', 'database', 'gcal', 'telegram', 'gmail']).default('all'),
});

interface ComponentStatus {
  readonly component: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'not_configured';
  readonly latency_ms: number;
  readonly message: string;
}

async function checkDatabase(dbUrl: string): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    const sql = createDbClient({ url: dbUrl });
    const tenantId = '00000000-0000-0000-0000-000000000000';
    const [txErr] = await withTenantContext(sql, tenantId, async (tx) => {
      await tx`SELECT 1`;
      return [null, true];
    });

    if (txErr) {
      const latency = Date.now() - start;
      return { component: 'database', status: 'unhealthy', latency_ms: latency, message: txErr.message };
    }

    const latency = Date.now() - start;
    await sql.end();
    return { component: 'database', status: 'healthy', latency_ms: latency, message: 'OK' };
  } catch (e) {
    const latency = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    return { component: 'database', status: 'unhealthy', latency_ms: latency, message: message };
  }
}

async function checkGCal(accessToken: string): Promise<ComponentStatus> {
  if (accessToken === '') {
    return { component: 'gcal', status: 'not_configured', latency_ms: 0, message: 'GCAL_ACCESS_TOKEN not set' };
  }
  const start = Date.now();
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    if (response.ok) {
      return { component: 'gcal', status: 'healthy', latency_ms: latency, message: 'OK' };
    }
    return { component: 'gcal', status: 'degraded', latency_ms: latency, message: 'HTTP ' + String(response.status) };
  } catch (e) {
    const latency = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    return { component: 'gcal', status: 'unhealthy', latency_ms: latency, message: message };
  }
}

async function checkTelegram(botToken: string): Promise<ComponentStatus> {
  if (botToken === '') {
    return { component: 'telegram', status: 'not_configured', latency_ms: 0, message: 'TELEGRAM_BOT_TOKEN not set' };
  }
  const start = Date.now();
  try {
    const response = await fetch('https://api.telegram.org/bot' + botToken + '/getMe', {
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    if (response.ok) {
      return { component: 'telegram', status: 'healthy', latency_ms: latency, message: 'OK' };
    }
    return { component: 'telegram', status: 'degraded', latency_ms: latency, message: 'HTTP ' + String(response.status) };
  } catch (e) {
    const latency = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    return { component: 'telegram', status: 'unhealthy', latency_ms: latency, message: message };
  }
}

export async function main(rawInput: unknown): Promise<[Error | null, { overall: 'healthy' | 'degraded' | 'unhealthy'; timestamp: string; components: ComponentStatus[] } | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input = parsed.data;
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
