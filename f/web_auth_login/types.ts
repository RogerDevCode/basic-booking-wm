import { z } from 'zod';

export type Input = z.infer<typeof InputSchema>;

export interface LoginResult {
    readonly user_id: string;
    readonly email: string;
    readonly full_name: string;
    readonly role: string;
    readonly profile_complete: boolean;
}

export interface UserRow {
    readonly user_id: string;
    readonly email: string;
    readonly full_name: string;
    readonly role: string;
    readonly password_hash: string;
    readonly is_active: boolean;
    readonly profile_complete: boolean;
}

export const InputSchema = z.object({
      email: z.email(),
      password: z.string().min(1),
    });
