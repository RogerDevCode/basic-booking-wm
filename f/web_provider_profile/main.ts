// ============================================================================
// WEB PROVIDER PROFILE — Provider self-service profile management
// ============================================================================
// Actions: get_profile, update_profile, change_password
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../internal/crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const ActionSchema = z.enum(['get_profile', 'update_profile', 'change_password']);

const InputSchema = z.object({
  action: ActionSchema,
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

type Result<T> = [Error | null, T | null];

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

async function getProfile(sql: postgres.Sql | postgres.TransactionSql, providerId: string): Promise<Result<ProfileRow>> {
  const rows = await sql.values<[
    string, string, string, string | null, string | null, string | null,
    string | null, string | null, string | null, string | null,
    string | null, string | null, string | null, string | null,
    string | null, string | null, boolean, boolean, string | null,
  ][]>`
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
  if (row === undefined) return [new Error('Provider not found'), null];
  return [null, {
    id: row[0],
    name: row[1],
    email: row[2],
    honorific_label: row[3],
    specialty_name: row[4],
    timezone_name: row[5],
    phone_app: row[6],
    phone_contact: row[7],
    telegram_chat_id: row[8],
    gcal_calendar_id: row[9],
    address_street: row[10],
    address_number: row[11],
    address_complement: row[12],
    address_sector: row[13],
    region_name: row[14],
    commune_name: row[15],
    is_active: row[16],
    has_password: row[17],
    last_password_change: row[18],
  }];
}

async function updateProfile(sql: postgres.Sql | postgres.TransactionSql, providerId: string, input: Readonly<z.infer<typeof InputSchema>>): Promise<Result<ProfileRow>> {
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
}

async function changePassword(
  sql: postgres.Sql | postgres.TransactionSql,
  providerId: string,
  currentPassword: string,
  newPassword: string
): Promise<Result<{ readonly success: boolean; readonly message: string }>> {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) return [new Error(`Password policy failed: ${policy.errors.join(', ')}`), null];

  const providers = await sql.values<[string | null][]>`SELECT password_hash FROM providers WHERE id = ${providerId}::uuid LIMIT 1`;
  const provider = providers[0];
  if (provider === undefined) return [new Error('Provider not found'), null];
  if (provider[0] === null) return [new Error('No password set. Contact admin.'), null];

  const isValid = await verifyPassword(currentPassword, provider[0]);
  if (!isValid) return [new Error('Current password is incorrect'), null];

  const newHash = await hashPassword(newPassword);
  await sql`
    UPDATE providers SET password_hash = ${newHash}, last_password_change = NOW(), updated_at = NOW()
    WHERE id = ${providerId}::uuid
  `;

  return [null, { success: true, message: 'Password changed successfully' }];
}

export async function main(rawInput: unknown): Promise<[Error | null, unknown | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });
  const tenantId = input.provider_id || '00000000-0000-0000-0000-000000000000';

  try {
    if (input.action === 'get_profile') {
      const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
        return getProfile(tx, input.provider_id);
      });
      if (txErr != null) return [txErr, null];
      if (txData === null) return [new Error('Provider not found'), null];
      return [null, txData];
    }

    if (input.action === 'update_profile') {
      const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
        return updateProfile(tx, input.provider_id, input);
      });
      if (txErr != null) return [txErr, null];
      if (txData === null) return [new Error('Update failed'), null];
      return [null, txData];
    }

    if (input.action === 'change_password') {
      const currentPw = input.current_password;
      const newPw = input.new_password;
      if (currentPw == null || newPw == null) return [new Error('change_password requires current_password and new_password'), null];
      const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
        return changePassword(tx, input.provider_id, currentPw, newPw);
      });
      if (txErr != null) return [txErr, null];
      if (txData === null) return [new Error('Password change failed'), null];
      return [null, txData];
    }

    return [new Error(`Unknown action: ${input.action}`), null];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`Internal error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
