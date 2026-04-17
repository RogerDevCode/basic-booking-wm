import { z } from 'zod';

export const InputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  telegram_chat_id: z.string().optional(),
  timezone: z.string().default('America/Mexico_City'),
  idempotency_key: z.string().min(1).optional(),
  provider_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface ClientResult {
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_chat_id: string | null;
  timezone: string;
  created: boolean;
}