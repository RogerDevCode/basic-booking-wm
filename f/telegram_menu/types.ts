import { z } from 'zod';

export const InputSchema = z.object({
  action: z.enum(['show', 'select_option', 'start']),
  chat_id: z.string(),
  user_input: z.string().optional(),
  client_id: z.string().optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface MenuResult {
  success: boolean;
  data: Record<string, unknown> | null;
  error_message: string | null;
}