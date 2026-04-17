import { z } from 'zod';

export const InputSchema = z.object({
  calendar_id: z.string().min(1),
  calendar_type: z.enum(['provider', 'client']).default('provider'),
  old_channel_id: z.string().optional(),
  old_resource_id: z.string().optional(),
  webhook_base_url: z.url().optional(),
  ttl_seconds: z.number().int().min(3600).max(2592000).default(86400),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface RenewResult {
  readonly stopped_old: boolean;
  readonly channel_id: string;
  readonly resource_id: string;
  readonly expiration: string;
}