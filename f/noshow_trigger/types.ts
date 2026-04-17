import { z } from 'zod';

export const InputSchema = z.object({
  lookback_minutes: z.number().int().min(1).default(30),
  dry_run: z.boolean().default(false),
}).readonly();

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface NoShowStats {
  processed: number;
  marked: number;
  skipped: number;
  booking_ids: string[];
}

export const ProviderRowSchema = z.object({
  provider_id: z.string().uuid(),
});

export type ProviderRow = z.infer<typeof ProviderRowSchema>;
