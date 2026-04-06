// ============================================================================
// WEB PROVIDER PROFILE — Provider self-service profile management
// ============================================================================
// Actions: get_profile, update_profile, change_password
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../internal/crypto';

const ActionSchema = z.enum(['get_profile', 'update_profile', 'change_password']);

const InputSchema = z.object({
  action: ActionSchema,
  provider_id: z.uuid(),
  // For update_profile
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
  // For change_password
  current_password: z.string().optional(),
  new_password: z.string().optional(),
});

type Result<T> = [Error | null, T | null];

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  return postgres(url, { ssl: 'require' });
}

interface ProfileRow {
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

async function getProfile(sql: postgres.Sql, providerId: string): Promise<Result<ProfileRow>> {
  try {
    const rows = await sql<ProfileRow[]>`
      SELECT
        p.id, p.name, p.email, h.label AS honorific_label,
        s.name AS specialty_name, t.name AS timezone_name,
        p.phone_app, p.phone_contact, p.telegram_chat_id, p.gcal_calendar_id,
        p.address_street, p.address_number, p.address_complement, p.address_sector,
        r.name AS region_name, c.name AS commune_name,
        p.is_active, (p.password_hash IS NOT NULL) AS has_password,
        p.last_password_change
      FROM providers p
      LEFT JOIN honorifics h ON h.honorific_id = p.honorific_id
      LEFT JOIN specialties s ON s.specialty_id = p.specialty_id
      LEFT JOIN timezones t ON t.id = p.timezone_id
      LEFT JOIN regions r ON r.region_id = p.region_id
      LEFT JOIN communes c ON c.commune_id = p.commune_id
      WHERE p.id = ${providerId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (row == null) return [new Error('Provider not found'), null];
    return [null, row as ProfileRow];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`get_profile_failed: ${msg}`), null];
  }
}

async function updateProfile(sql: postgres.Sql, providerId: string, input: z.infer<typeof InputSchema>): Promise<Result<ProfileRow>> {
  try {
    const fields: string[] = [];
    const params: (string | number | null)[] = [];
    let pIdx = 1;

    if (input.name != null) { fields.push(`name = $${String(pIdx++)}`); params.push(input.name); }
    if (input.email != null) { fields.push(`email = $${String(pIdx++)}`); params.push(input.email); }
    if (input.phone_app != null) { fields.push(`phone_app = $${String(pIdx++)}`); params.push(input.phone_app); }
    if (input.phone_contact != null) { fields.push(`phone_contact = $${String(pIdx++)}`); params.push(input.phone_contact); }
    if (input.telegram_chat_id != null) { fields.push(`telegram_chat_id = $${String(pIdx++)}`); params.push(input.telegram_chat_id); }
    if (input.gcal_calendar_id != null) { fields.push(`gcal_calendar_id = $${String(pIdx++)}`); params.push(input.gcal_calendar_id); }
    if (input.address_street != null) { fields.push(`address_street = $${String(pIdx++)}`); params.push(input.address_street); }
    if (input.address_number != null) { fields.push(`address_number = $${String(pIdx++)}`); params.push(input.address_number); }
    if (input.address_complement != null) { fields.push(`address_complement = $${String(pIdx++)}`); params.push(input.address_complement); }
    if (input.address_sector != null) { fields.push(`address_sector = $${String(pIdx++)}`); params.push(input.address_sector); }
    if (input.region_id != null) { fields.push(`region_id = $${String(pIdx++)}`); params.push(input.region_id); }
    if (input.commune_id != null) { fields.push(`commune_id = $${String(pIdx++)}`); params.push(input.commune_id); }

    if (fields.length === 0) return [new Error('update_profile_failed: no fields provided'), null];
    fields.push(`updated_at = NOW()`);
    params.push(providerId);

    const query = `UPDATE providers SET ${fields.join(', ')} WHERE id = $${String(pIdx)}::uuid`;
    await sql.unsafe(query, params);

    return getProfile(sql, providerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`update_profile_failed: ${msg}`), null];
  }
}

async function changePassword(
  sql: postgres.Sql,
  providerId: string,
  currentPassword: string,
  newPassword: string
): Promise<Result<{ readonly success: boolean; readonly message: string }>> {
  try {
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) return [new Error(`Password policy failed: ${policy.errors.join(', ')}`), null];

    const providers = await sql`SELECT password_hash FROM providers WHERE id = ${providerId}::uuid LIMIT 1`;
    const provider = providers[0] as { password_hash: string | null } | undefined;
    if (provider == null) return [new Error('Provider not found'), null];
    if (provider.password_hash == null) return [new Error('No password set. Contact admin.'), null];

    const isValid = await verifyPassword(currentPassword, provider.password_hash);
    if (!isValid) return [new Error('Current password is incorrect'), null];

    const newHash = await hashPassword(newPassword);
    await sql`
      UPDATE providers SET password_hash = ${newHash}, last_password_change = NOW(), updated_at = NOW()
      WHERE id = ${providerId}::uuid
    `;

    return [null, { success: true, message: 'Password changed successfully' }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`change_password_failed: ${msg}`), null];
  }
}

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };

  const input = parsed.data;
  const sql = getDb();

  try {
    if (input.action === 'get_profile') {
      const [err, result] = await getProfile(sql, input.provider_id);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'update_profile') {
      const [err, result] = await updateProfile(sql, input.provider_id, input);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'change_password') {
      const currentPw = input.current_password;
      const newPw = input.new_password;
      if (currentPw == null || newPw == null) return { success: false, data: null, error_message: 'change_password requires current_password and new_password' };
      const [err, result] = await changePassword(sql, input.provider_id, currentPw, newPw);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    return { success: false, data: null, error_message: `Unknown action: ${input.action}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: `Internal error: ${msg}` };
  } finally {
    await sql.end();
  }
}
