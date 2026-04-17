import { z } from 'zod';

export const InputSchema = z.object({
  admin_user_id: z.uuid(),
  target_user_id: z.uuid(),
  new_role: z.enum(['client', 'provider', 'admin']),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface ChangeRoleResult {
  user_id: string;
  full_name: string;
  old_role: string;
  new_role: string;
}