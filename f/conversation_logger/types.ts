import { z } from 'zod';

export const InputSchema = z.object({
  client_id: z.uuid().optional().nullable(),
  provider_id: z.uuid(),
  channel: z.enum(['telegram', 'web', 'api']),
  direction: z.enum(['incoming', 'outgoing']),
  content: z.string().min(1).max(2000),
  intent: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface LogResult {
  message_id: string;
}