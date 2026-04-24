import { createDbClient } from '../internal/db/client.ts';
import type { ComponentStatus } from './types.ts';

export async function checkDatabase(dbUrl: string): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    const sql = createDbClient({ url: dbUrl });
    await sql`SELECT 1`;
    const latency = Date.now() - start;
    await sql.end();
    return { component: 'database', status: 'healthy', latency_ms: latency, message: 'OK' };
  } catch (e) {
    const latency = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    return { component: 'database', status: 'unhealthy', latency_ms: latency, message: message };
  }
}

export async function checkGCal(accessToken: string): Promise<ComponentStatus> {
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

export async function checkTelegram(botToken: string): Promise<ComponentStatus> {
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

export function checkGmail(smtpPassword: string): Promise<ComponentStatus> {
  if (smtpPassword === '') {
    return Promise.resolve({ component: 'gmail', status: 'not_configured', latency_ms: 0, message: 'GMAIL_SMTP_PASSWORD not set' });
  }
  return Promise.resolve({ component: 'gmail', status: 'healthy', latency_ms: 0, message: 'OK' });
}