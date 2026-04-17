import { z } from 'zod';

export const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'client']).default('provider'),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export const GCalWatchResponseSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  expiration: z.union([z.string(), z.number()]).optional().transform(v => v ? Number(v) : Date.now()),
});

export type GCalWatchResponse = Readonly<z.infer<typeof GCalWatchResponseSchema>>;

export interface WebhookSetupResult {
  readonly channel_id: string;
  readonly resource_id: string;
  readonly calendar_id: string;
  readonly expiration_unix_ms: number;
  readonly expiration_iso: string;
  readonly webhook_url: string;
  readonly calendar_type: string;
}