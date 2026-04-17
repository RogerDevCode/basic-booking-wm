import { z } from 'zod';

export const InputSchema = z.object({
  user_id: z.uuid(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface UserProfileResult {
  readonly user_id: string;
  readonly email: string | null;
  readonly full_name: string;
  readonly role: string;
  readonly rut: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly is_active: boolean;
  readonly profile_complete: boolean;
  readonly last_login: string | null;
}