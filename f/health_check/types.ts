import { z } from 'zod';

export const InputSchema = z.object({
  component: z.enum(['all', 'database', 'gcal', 'telegram', 'gmail']).default('all'),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface ComponentStatus {
  readonly component: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'not_configured';
  readonly latency_ms: number;
  readonly message: string;
}