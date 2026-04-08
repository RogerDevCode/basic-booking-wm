// ============================================================================
// GCal WEBHOOK SETUP — Register a Google Calendar push notifications channel
// ============================================================================
// Creates a webhook channel so Google Calendar pushes change notifications
// to Windmill when a calendar event is created, updated, or deleted.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { randomUUID } from 'crypto';

const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'client']).default('provider'),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400),
});

interface WebhookSetupResult {
  readonly channel_id: string;
  readonly resource_id: string;
  readonly calendar_id: string;
  readonly expiration_unix_ms: number;
  readonly expiration_iso: string;
  readonly webhook_url: string;
  readonly calendar_type: string;
}

export async function main(rawInput: unknown): Promise<[Error | null, WebhookSetupResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return [new Error('GCAL_ACCESS_TOKEN not configured'), null];
  }

  const webhookBaseUrl = input.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
  if (!webhookBaseUrl) {
    return [new Error('webhook_base_url or WINDMILL_WEBHOOK_BASE_URL must be set'), null];
  }

  const channelId = randomUUID();
  const webhookUrl = `${webhookBaseUrl}/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver`;

  const body = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: process.env['GCAL_WEBHOOK_SECRET'] ?? channelId,
    params: { calendar_type: input.calendar_type },
    expiration: String(Date.now() + input.ttl_seconds * 1000),
  };

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendar_id)}/events/watch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const isPermanent = response.status >= 400 && response.status < 500;
      return [
        new Error(`GCal API ${String(response.status)}: ${errorText}${isPermanent ? ' (permanent)' : ''}`),
        null,
      ];
    }

    const data = await response.json();
    if (typeof data !== 'object' || data === null) {
      return [new Error('Invalid GCal API response'), null];
    }

    const responseObj = data as Record<string, unknown>;
    const channelIdValue = typeof responseObj['id'] === 'string' ? responseObj['id'] : channelId;
    const resourceIdValue = typeof responseObj['resourceId'] === 'string' ? responseObj['resourceId'] : '';
    const expirationMs = Number(responseObj['expiration'] ?? (Date.now() + input.ttl_seconds * 1000));

    return [null, {
      channel_id: channelIdValue,
      resource_id: resourceIdValue,
      calendar_id: input.calendar_id,
      expiration_unix_ms: expirationMs,
      expiration_iso: new Date(expirationMs).toISOString(),
      webhook_url: webhookUrl,
      calendar_type: input.calendar_type,
    }];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(`Internal error: ${error.message}`), null];
  }
}
