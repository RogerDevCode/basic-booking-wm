import { z } from 'zod';

export const ActionSchema = z.enum(['list', 'create', 'update', 'activate', 'deactivate', 'reset_password']);

export const InputSchema = z.object({
  action: ActionSchema,
  provider_id: z.uuid().optional(),
  name: z.string().min(2).max(200).optional(),
  email: z.email().optional(),
  specialty_id: z.uuid().optional(),
  honorific_id: z.uuid().optional(),
  timezone_id: z.number().int().optional(),
  phone_app: z.string().max(20).optional(),
  phone_contact: z.string().max(20).optional(),
  telegram_chat_id: z.string().max(100).optional(),
  gcal_calendar_id: z.string().max(500).optional(),
  address_street: z.string().max(300).optional(),
  address_number: z.string().max(20).optional(),
  address_complement: z.string().max(200).optional(),
  address_sector: z.string().max(200).optional(),
  region_id: z.number().int().optional(),
  commune_id: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export type Input = z.infer<typeof InputSchema>;

export interface ProviderRow {
  readonly id: string;
  readonly honorific_id: string | null;
  readonly name: string;
  readonly email: string;
  readonly specialty_id: string | null;
  readonly timezone_id: number | null;
  readonly phone_app: string | null;
  readonly phone_contact: string | null;
  readonly telegram_chat_id: string | null;
  readonly gcal_calendar_id: string | null;
  readonly address_street: string | null;
  readonly address_number: string | null;
  readonly address_complement: string | null;
  readonly address_sector: string | null;
  readonly region_id: number | null;
  readonly commune_id: number | null;
  readonly is_active: boolean;
  readonly has_password: boolean;
  readonly last_password_change: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly honorific_label: string | null;
  readonly specialty_name: string | null;
  readonly timezone_name: string | null;
  readonly region_name: string | null;
  readonly commune_name: string | null;
}

export interface CreateProviderResult extends ProviderRow {
  readonly temp_password: string;
}
