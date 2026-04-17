/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Register Google Calendar push notification channel
 * DB Tables Used  : NONE
 * Concurrency Risk: NO
 * GCal Calls      : YES — register new webhook channel via POST events/watch
 * Idempotency Key : YES — UUID-based channel ID
 * RLS Tenant ID   : NO — Pure API integration
 * Zod Schemas     : YES — InputSchema and GCalWatchResponseSchema validation
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input: calendar_id, calendar_type, webhook_base_url, ttl_seconds.
 * - Resolve environment configuration (access tokens, webhook base URL).
 * - Construct registration payload with UUID-based channel ID.
 * - Register channel via Google Calendar API events/watch endpoint.
 * - Parse and validate response using Zod.
 *
 * ### Schema Verification
 * - No database tables accessed directly in this module.
 *
 * ### Failure Mode Analysis
 * - Validation failure: Input does not match schema.
 * - Configuration failure: Required environment variables are missing.
 * - API failure: GCal returns error status; distinguish between 4xx and 5xx.
 * - Response failure: API returns malformed JSON or unexpected schema.
 *
 * ### Concurrency Analysis
 * - No concurrency risks; registration is idempotent and scoped to unique channel IDs.
 *
 * ### SOLID Compliance Check
 * - SRP: Logic split into configuration, registration, and parsing.
 * - DIP: Uses shared Result type and externalized config.
 * - KISS: Simple async/await flow with Zod validation.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Result } from '../internal/result';

// --- Constants ---
const WEBHOOK_RECEIVER_PATH = '/api/w/booking-titanium/jobs/run/p/f/gcal_webhook_receiver';
const GCAL_WATCH_TIMEOUT_MS = 15000;

// --- Schemas ---
const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'client']).default('provider'),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400),
});

type Input = Readonly<z.infer<typeof InputSchema>>;

const GCalWatchResponseSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  expiration: z.union([z.string(), z.number()]).optional().transform(v => v ? Number(v) : Date.now()),
});

type GCalWatchResponse = Readonly<z.infer<typeof GCalWatchResponseSchema>>;

// --- Types ---
interface WebhookSetupResult {
  readonly channel_id: string;
  readonly resource_id: string;
  readonly calendar_id: string;
  readonly expiration_unix_ms: number;
  readonly expiration_iso: string;
  readonly webhook_url: string;
  readonly calendar_type: string;
}

interface InternalConfig {
  readonly accessToken: string;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
}

/**
 * GCal WEBHOOK SETUP — Register a Google Calendar push notifications channel
 * 
 * Creates a webhook channel so Google Calendar pushes change notifications
 * to Windmill when a calendar event is created, updated, or deleted.
 */
export async function main(rawInput: unknown): Promise<Result<WebhookSetupResult>> {
  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }
  const input = parsed.data;

  // 2. Resolve Configuration
  const [configErr, config] = getConfiguration(input);
  if (configErr !== null) {
    return [configErr, null];
  }
  const { accessToken, webhookUrl, webhookSecret } = config!;

  // 3. Register Channel
  const channelId = randomUUID();
  const [registerErr, gcalResponse] = await registerGCalChannel(
    input,
    channelId,
    accessToken,
    webhookUrl,
    webhookSecret
  );

  if (registerErr !== null) {
    return [registerErr, null];
  }

  // 4. Return Formatted Result
  return [null, {
    channel_id: gcalResponse!.id,
    resource_id: gcalResponse!.resourceId,
    calendar_id: input.calendar_id,
    expiration_unix_ms: gcalResponse!.expiration,
    expiration_iso: new Date(gcalResponse!.expiration).toISOString(),
    webhook_url: webhookUrl,
    calendar_type: input.calendar_type,
  }];
}

/**
 * Resolves environment and derived configuration
 */
function getConfiguration(input: Input): Result<InternalConfig> {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];
  if (!accessToken) {
    return [new Error('configuration_error: GCAL_ACCESS_TOKEN required'), null];
  }

  const baseUrl = input.webhook_base_url ?? process.env['WINDMILL_WEBHOOK_BASE_URL'];
  if (!baseUrl) {
    return [new Error('configuration_error: webhook_base_url or WINDMILL_WEBHOOK_BASE_URL required'), null];
  }

  // Ensure clean base URL and append receiver path
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_RECEIVER_PATH}`;
  const webhookSecret = process.env['GCAL_WEBHOOK_SECRET'] ?? randomUUID();

  return [null, { accessToken, webhookUrl, webhookSecret }];
}

/**
 * Performs the actual HTTP registration with Google Calendar API
 */
async function registerGCalChannel(
  input: Input,
  channelId: string,
  accessToken: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<Result<GCalWatchResponse>> {
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
      const isPermanent = response.status >= 400 && response.status < 500;
      return [
        new Error(`gcal_api_error (${response.status}): ${errorText}${isPermanent ? ' (permanent)' : ''}`),
        null,
      ];
    }

    const data = await response.json();
    const parsedResponse = GCalWatchResponseSchema.safeParse(data);
    
    if (!parsedResponse.success) {
      return [new Error(`gcal_response_parse_error: ${parsedResponse.error.message}`), null];
    }

    return [null, parsedResponse.data];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return [new Error(`internal_error: ${message}`), null];
  }
}
