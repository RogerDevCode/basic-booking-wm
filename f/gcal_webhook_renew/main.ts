// ============================================================================
// GCal WEBHOOK RENEW — Renew an expiring Google Calendar push notifications channel
// ============================================================================
// Stops an existing channel (if provided) and registers a new one for the
// same calendar. Run via cron schedule ~24h before expiration.
//
// workflow:
// 1. If old_channel_id and old_resource_id provided → stop the old channel
// 2. Register a new watch channel for the same calendar
// 3. Return new channel details to persist in DB or Windmill Variables
//
// Reference: https://developers.google.com/calendar/api/v3/reference/channels/stop
// ============================================================================

import { z } from 'zod';
import { randomUUID } from 'crypto';

const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'patient']).default('provider'),
  old_channel_id: z.string().optional(),
  old_resource_id: z.string().optional(),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400),
});

interface RenewResult {
  stopped_old: boolean;
  channel_id: string;
  resource_id: string;
  calendar_id: string;
  expiration_unix_ms: number;
  expiration_iso: string;
  webhook_url: string;
}

async function stopChannel(accessToken: string, channelId: string, resourceId: string): Promise<boolean> {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: channelId, resourceId }),
      signal: AbortSignal.timeout(10000),
    });
    // 204 = success (no content), 404 = already stopped (treat as OK)
    return response.status === 204 || response.status === 404;
  } catch {
    return false; // Non-fatal: proceed to create new channel
  }
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: RenewResult | null;
  error_message: string | null;
}> {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
    }

    const { calendar_id, calendar_type, old_channel_id, old_resource_id, ttl_seconds } = parsed.data;

    const accessToken = process.env['GCAL_ACCESS_TOKEN'];
    if (!accessToken) {
      return { success: false, data: null, error_message: 'GCAL_ACCESS_TOKEN not configured' };
    }

    const webhookBaseUrl = parsed.data.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
    if (!webhookBaseUrl) {
      return { success: false, data: null, error_message: 'webhook_base_url or WINDMILL_WEBHOOK_BASE_URL must be set' };
    }

    // Step 1: Stop old channel (non-fatal if it fails)
    let stoppedOld = false;
    if (old_channel_id && old_resource_id) {
      stoppedOld = await stopChannel(accessToken, old_channel_id, old_resource_id);
    }

    // Step 2: Register new channel
    const newChannelId = randomUUID();
    const webhookUrl = `${webhookBaseUrl}/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver`;

    const body = {
      id: newChannelId,
      type: 'web_hook',
      address: webhookUrl,
      token: process.env['GCAL_WEBHOOK_SECRET'] ?? newChannelId,
      params: { calendar_type },
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
      return {
        success: false,
        data: null,
        error_message: `GCal API ${String(response.status)}: ${errorText}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;
    const expirationMs = Number(data['expiration'] ?? (Date.now() + ttl_seconds * 1000));

    return {
      success: true,
      data: {
        stopped_old: stoppedOld,
        channel_id: data['id'] as string,
        resource_id: data['resourceId'] as string,
        calendar_id,
        expiration_unix_ms: expirationMs,
        expiration_iso: new Date(expirationMs).toISOString(),
        webhook_url: webhookUrl,
      },
      error_message: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: `Internal error: ${error.message}` };
  }
}
