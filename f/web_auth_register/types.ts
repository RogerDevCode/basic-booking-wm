import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../internal/config/index.ts';

export type Result<T> = [Error | null, T | null];

export interface RegisterResult {
    readonly user_id: string;
    readonly email: string;
    readonly full_name: string;
    readonly role: string;
}

export const InputSchema = z.object({
      full_name: z.string().min(3).max(200),
      rut: z.string().min(1).max(12),
      email: z.email(),
      address: z.string().min(1).max(300),
      phone: z.string().min(1).max(50),
      password: z.string().min(8).max(128),
      password_confirm: z.string().min(8).max(128),
      timezone: z.string().default(DEFAULT_TIMEZONE),
    });
