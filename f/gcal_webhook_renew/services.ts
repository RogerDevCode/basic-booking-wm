import type { Input, RenewResult } from './types.ts';
import type { Result } from '../internal/result/index.ts';

export async function stopChannel(accessToken: string, channelId: string, resourceId: string): Promise<boolean> {
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
    return response.status === 204 || response.status === 404;
  } catch {
    return false;
  }
}

export async function renewChannel(input: Input): Promise<Result<RenewResult>> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return [new Error('GCAL_ACCESS_TOKEN not configured'), null];
  }

  const webhookBaseUrl = input.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
  if (!webhookBaseUrl) {
    return [new Error('webhook_base_url or WINDMILL_WEBHOOK_BASE_URL must be set'), null];
  }

  let stoppedOld = false;
  if (input.old_channel_id && input.old_resource_id) {
    stoppedOld = await stopChannel(accessToken, input.old_channel_id, input.old_resource_id);
  }

  const { randomUUID } = await import('crypto');
  const newChannelId = randomUUID();
  const webhookUrl = `${webhookBaseUrl}/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver`;

  const body = {
    id: newChannelId,
    type: 'web_hook',
    address: webhookUrl,
    token: process.env['GCAL_WEBHOOK_SECRET'] ?? newChannelId,
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
      return [new Error(`GCal API ${String(response.status)}: ${errorText}`), null];
    }

    const data = await response.json();
    if (typeof data !== 'object' || data === null) {
      return [new Error('Invalid GCal API response'), null];
    }

    const responseObj = data as Record<string, unknown>;
    const channelIdValue = typeof responseObj['id'] === 'string' ? responseObj['id'] : newChannelId;
    const resourceIdValue = typeof responseObj['resourceId'] === 'string' ? responseObj['resourceId'] : '';
    const expirationMs = Number(responseObj['expiration'] ?? (Date.now() + input.ttl_seconds * 1000));

    return [null, {
      stopped_old: stoppedOld,
      channel_id: channelIdValue,
      resource_id: resourceIdValue,
      expiration: new Date(expirationMs).toISOString(),
    }];
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return [new Error(`Internal error: ${error.message}`), null];
  }
}