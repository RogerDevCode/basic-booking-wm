import { z } from 'zod';

export const ActionSchema = z.enum(['admin_generate_temp', 'provider_change', 'provider_verify']);
export type AuthAction = z.infer<typeof ActionSchema>;

export const InputSchema = z.object({
  tenant_id: z.uuid(),
  action: ActionSchema,
  provider_id: z.uuid(),
  current_password: z.string().optional(),
  new_password: z.string().optional(),
});

export type AuthInput = Readonly<z.infer<typeof InputSchema>>;

export interface TempPasswordResult {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly tempPassword: string;
  readonly expires_at: string;
  readonly message: string;
}

export interface PasswordChangeResult {
  readonly provider_id: string;
  readonly message: string;
}

export interface VerifyResult {
  readonly provider_id: string;
  readonly valid: boolean;
  readonly provider_name: string | null;
}
