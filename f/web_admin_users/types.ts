import { z } from 'zod';

export const InputSchema = z.object({
  admin_user_id: z.uuid(),
  action: z.enum(['list', 'get', 'update', 'deactivate', 'activate']),
  target_user_id: z.uuid().optional(),
  full_name: z.string().max(200).optional(),
  email: z.email().optional(),
  phone: z.string().max(20).optional(),
  role: z.enum(['admin', 'provider', 'client']).optional(),
});

export interface UserInfo {
  user_id: string;
  full_name: string;
  email: string | null;
  rut: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  telegram_chat_id: string | null;
  last_login: string | null;
  created_at: string;
}

export interface UsersListResult {
  users: UserInfo[];
  total: number;
}
