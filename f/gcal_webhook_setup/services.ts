import { randomUUID } from 'crypto';
import type { Result } from '../internal/result/index';
import type { Input, WebhookSetupResult } from './types';

const WEBHOOK_RECEIVER_PATH = '/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver';
const GCAL_WATCH_TIMEOUT_MS = 15000;

interface InternalConfig {
  accessToken: string;
  webhookUrl: string;
  webhookSecret: string;
}

export function getConfiguration(input: Input): Result<InternalConfig> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return [new Error('configuration_error: GCAL_ACCESS_TOKEN required'), null];
  }

  const baseUrl = input.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
  if (!baseUrl) {
    return [new Error('configuration_error: webhook_base_url or WINDMILL_WEBHOOK_BASE_URL required'), null];
  }

  const webhookUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_RECEIVER_PATH}`;
  const webhookSecret = process.env['GCAL_WEBHOOK_SECRET'] ?? randomUUID();

  return [null, { accessToken, webhookUrl, webhookSecret }];
}

export async function setupWebhook(input: Input): Promise<Result<WebhookSetupResult>> {
  const [configErr, config] = getConfiguration(input);
  if (configErr !== null || config === null) {
    return [configErr ?? new Error('config_error'), null];
  }
  const { accessToken, webhookUrl, webhookSecret } = config;

  const channelId = randomUUID();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendar_id)}/events/watch`;
  
  const payload = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: webhookSecret,
    params: { calendar_type: input.calendar_type },
    expiration: String(Date.now() + input.ttl_seconds * 1000),
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GCAL_WATCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown_error');
      return [new Error(`gcal_api_error (${String(response.status)}): ${errorText}`), null];
    }

    const data = await response.json() as { id?: string; resourceId?: string; expiration?: number };
    if (!data.id || !data.resourceId) {
      return [new Error('gcal_response_parse_error'), null];
    }

    return [null, {
      channel_id: data.id,
      resource_id: data.resourceId,
      calendar_id: input.calendar_id,
      expiration_unix_ms: data.expiration ?? Date.now(),
      expiration_iso: new Date(data.expiration ?? Date.now()).toISOString(),
      webhook_url: webhookUrl,
      calendar_type: input.calendar_type,
    }];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return [new Error(`internal_error: ${message}`), null];
  }
}