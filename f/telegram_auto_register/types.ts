import { z } from 'zod';

export const InputSchema = z.object({
  chat_id: z.string(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface RegisterResult {
  user_id: string;
  is_new: boolean;
}