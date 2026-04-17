import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../internal/config';

export const InputSchema = z.object({
  chat_id: z.string().min(1),
  rut: z.string().min(1).max(12),
  email: z.email(),
  address: z.string().min(1).max(300),
  phone: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
  password_confirm: z.string().min(8).max(128),
  timezone: z.string().default(DEFAULT_TIMEZONE),
});

export interface CompleteProfileResult {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly rut: string;
  readonly role: string;
}

export interface UserRow {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string | null;
  readonly rut: string | null;
  readonly role: string;
}
