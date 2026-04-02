// ============================================================================
// GCal WEBHOOK SETUP — Register a Google Calendar push notifications channel
// ============================================================================
// Creates a webhook channel so Google Calendar pushes change notifications
// to Windmill when a calendar event is created, updated, or deleted.
//
// Run once per calendar (provider or patient) to set up the webhook.
// Re-register before expiry using gcal_webhook_renew.
//
// Reference: https://developers.google.com/calendar/api/v3/reference/channels/watch
// ============================================================================

import { z } from 'zod';
import { randomUUID } from 'crypto';

const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'patient']).default('provider'),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400), // 1h–30d
});

interface WebhookSetupResult {
  channel_id: string;
  resource_id: string;
  calendar_id: string;
  expiration_unix_ms: number;
  expiration_iso: string;
  webhook_url: string;
  calendar_type: string;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: WebhookSetupResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { calendar_id, calendar_type, ttl_seconds } = parsed.data;

    const accessToken = process.env['GCAL_ACCESS_TOKEN'];
    if (!accessToken) {
      return { success: false, data: null, error_message: 'GCAL_ACCESS_TOKEN not configured' };
    }

    const webhookBaseUrl = parsed.data.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
    if (!webhookBaseUrl) {
      return { success: false, data: null, error_message: 'webhook_base_url or WINDMILL_WEBHOOK_BASE_URL must be set' };
    }

    const channelId = randomUUID();
    const webhookUrl = `${webhookBaseUrl}/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver`;

    const body = {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: process.env['GCAL_WEBHOOK_SECRET'] ?? channelId,
      params: {
        calendar_type,
      },
      expiration: String((Date.now() + ttl_seconds * 1000)),
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events/watch`,
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
      return {
        success: false,
        data: null,
        error_message: `GCal API ${String(response.status)}: ${errorText}${isPermanent ? ' (permanent)' : ''}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;

    const expirationMs = Number(data['expiration'] ?? (Date.now() + ttl_seconds * 1000));

    return {
      success: true,
      data: {
        channel_id: data['id'] as string,
        resource_id: data['resourceId'] as string,
        calendar_id,
        expiration_unix_ms: expirationMs,
        expiration_iso: new Date(expirationMs).toISOString(),
        webhook_url: webhookUrl,
        calendar_type,
      },
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
