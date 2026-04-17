import "@total-typescript/ts-reset";
import postgres from 'postgres';
import { z } from 'zod';
import type { Result } from '../internal/result';

export type ProfileInput = Readonly<z.infer<typeof InputSchema>>;
export type ProfileActionHandler = (
      sql: postgres.Sql,
      input: ProfileInput
    ) => Promise<Result<unknown>>;

export interface ProfileRow {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly honorific_label: string | null;
    readonly specialty_name: string | null;
    readonly timezone_name: string | null;
    readonly phone_app: string | null;
    readonly phone_contact: string | null;
    readonly telegram_chat_id: string | null;
    readonly gcal_calendar_id: string | null;
    readonly address_street: string | null;
    readonly address_number: string | null;
    readonly address_complement: string | null;
    readonly address_sector: string | null;
    readonly region_name: string | null;
    readonly commune_name: string | null;
    readonly is_active: boolean;
    readonly has_password: boolean;
    readonly last_password_change: string | null;
}

export const InputSchema = z.object({
      action: z.enum(['get_profile', 'update_profile', 'change_password']),
      provider_id: z.uuid(),
      name: z.string().min(2).max(200).optional(),
      email: z.email().optional(),
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
      current_password: z.string().optional(),
      new_password: z.string().optional(),
    });
