// ============================================================================
// WEB ADMIN PROVIDER CRUD — Full provider management for admin dashboard
// ============================================================================
// Actions: list, create, update, activate, deactivate, reset_password
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { generateReadablePassword, hashPassword } from '../internal/crypto';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ActionSchema = z.enum(['list', 'create', 'update', 'activate', 'deactivate', 'reset_password']);

const InputSchema = z.object({
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

interface ProviderRow {
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

type Result<T> = [Error | null, T | null];

// ============================================================================
// DB HELPERS
// ============================================================================

function getDb(): postgres.Sql {
  const url = process.env['DATABASE_URL'];
  if (url == null || url === '') {
    throw new Error('CONFIGURATION_ERROR: DATABASE_URL is required');
  }
  return postgres(url, { ssl: 'require' });
}

// ============================================================================
// LIST providers with joins
// ============================================================================

async function listProviders(sql: postgres.Sql): Promise<Result<ProviderRow[]>> {
  try {
    const rows = await sql<ProviderRow[]>`
      SELECT
        p.id, p.honorific_id, p.name, p.email, p.specialty_id, p.timezone_id,
        p.phone_app, p.phone_contact, p.telegram_chat_id, p.gcal_calendar_id,
        p.address_street, p.address_number, p.address_complement, p.address_sector,
        p.region_id, p.commune_id, p.is_active,
        (p.password_hash IS NOT NULL) AS has_password,
        p.last_password_change, p.created_at, p.updated_at,
        h.label AS honorific_label,
        s.name AS specialty_name,
        t.name AS timezone_name,
        r.name AS region_name,
        c.name AS commune_name
      FROM providers p
      LEFT JOIN honorifics h ON h.honorific_id = p.honorific_id
      LEFT JOIN specialties s ON s.specialty_id = p.specialty_id
      LEFT JOIN timezones t ON t.id = p.timezone_id
      LEFT JOIN regions r ON r.region_id = p.region_id
      LEFT JOIN communes c ON c.commune_id = p.commune_id
      ORDER BY p.name ASC
    `;
    return [null, rows as ProviderRow[]];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

// ============================================================================
// CREATE provider
// ============================================================================

async function createProvider(
  sql: postgres.Sql,
  input: z.infer<typeof InputSchema>
): Promise<Result<ProviderRow>> {
  try {
    const name = input.name ?? '';
    const email = input.email ?? '';
    if (name === '' || email === '') {
      return [new Error('create_failed: name and email are required'), null];
    }

    // Generate temp password
    const tempPassword = generateReadablePassword(4);
    const passwordHash = await hashPassword(tempPassword);

    const rows = await sql<ProviderRow[]>`
      INSERT INTO providers (
        name, email, specialty_id, honorific_id, timezone_id,
        phone_app, phone_contact, telegram_chat_id, gcal_calendar_id,
        address_street, address_number, address_complement, address_sector,
        region_id, commune_id, is_active, password_hash, last_password_change
      ) VALUES (
        ${name}, ${email}, ${input.specialty_id ?? null}, ${input.honorific_id ?? null}, ${input.timezone_id ?? null},
        ${input.phone_app ?? null}, ${input.phone_contact ?? null}, ${input.telegram_chat_id ?? null}, ${input.gcal_calendar_id ?? null},
        ${input.address_street ?? null}, ${input.address_number ?? null}, ${input.address_complement ?? null}, ${input.address_sector ?? null},
        ${input.region_id ?? null}, ${input.commune_id ?? null}, ${input.is_active ?? true}, ${passwordHash}, NOW()
      )
      RETURNING id, name, email
    `;

    const row = rows[0] as { id: string; name: string; email: string } | undefined;
    if (row == null) return [new Error('create_failed: no row returned'), null];

    return [null, {
      ...row,
      honorific_id: input.honorific_id ?? null,
      specialty_id: input.specialty_id ?? null,
      timezone_id: input.timezone_id ?? null,
      phone_app: input.phone_app ?? null,
      phone_contact: input.phone_contact ?? null,
      telegram_chat_id: input.telegram_chat_id ?? null,
      gcal_calendar_id: input.gcal_calendar_id ?? null,
      address_street: input.address_street ?? null,
      address_number: input.address_number ?? null,
      address_complement: input.address_complement ?? null,
      address_sector: input.address_sector ?? null,
      region_id: input.region_id ?? null,
      commune_id: input.commune_id ?? null,
      is_active: input.is_active ?? true,
      has_password: true,
      last_password_change: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      honorific_label: null,
      specialty_name: null,
      timezone_name: null,
      region_name: null,
      commune_name: null,
      temp_password: tempPassword,
    } as ProviderRow & { readonly temp_password?: string }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return [new Error(`create_failed: email '${input.email}' already exists`), null];
    }
    return [new Error(`create_failed: ${msg}`), null];
  }
}

// ============================================================================
// UPDATE provider
// ============================================================================

async function updateProvider(
  sql: postgres.Sql,
  providerId: string,
  input: z.infer<typeof InputSchema>
): Promise<Result<ProviderRow>> {
  try {
    const fields: string[] = [];
    const params: (string | number | boolean | null)[] = [];
    let paramIdx = 1;

    if (input.name != null) { fields.push(`name = $${String(paramIdx++)}`); params.push(input.name); }
    if (input.email != null) { fields.push(`email = $${String(paramIdx++)}`); params.push(input.email); }
    if (input.specialty_id != null) { fields.push(`specialty_id = $${String(paramIdx++)}::uuid`); params.push(input.specialty_id); }
    if (input.honorific_id != null) { fields.push(`honorific_id = $${String(paramIdx++)}::uuid`); params.push(input.honorific_id); }
    if (input.timezone_id != null) { fields.push(`timezone_id = $${String(paramIdx++)}`); params.push(input.timezone_id); }
    if (input.phone_app != null) { fields.push(`phone_app = $${String(paramIdx++)}`); params.push(input.phone_app); }
    if (input.phone_contact != null) { fields.push(`phone_contact = $${String(paramIdx++)}`); params.push(input.phone_contact); }
    if (input.telegram_chat_id != null) { fields.push(`telegram_chat_id = $${String(paramIdx++)}`); params.push(input.telegram_chat_id); }
    if (input.gcal_calendar_id != null) { fields.push(`gcal_calendar_id = $${String(paramIdx++)}`); params.push(input.gcal_calendar_id); }
    if (input.address_street != null) { fields.push(`address_street = $${String(paramIdx++)}`); params.push(input.address_street); }
    if (input.address_number != null) { fields.push(`address_number = $${String(paramIdx++)}`); params.push(input.address_number); }
    if (input.address_complement != null) { fields.push(`address_complement = $${String(paramIdx++)}`); params.push(input.address_complement); }
    if (input.address_sector != null) { fields.push(`address_sector = $${String(paramIdx++)}`); params.push(input.address_sector); }
    if (input.region_id != null) { fields.push(`region_id = $${String(paramIdx++)}`); params.push(input.region_id); }
    if (input.commune_id != null) { fields.push(`commune_id = $${String(paramIdx++)}`); params.push(input.commune_id); }
    if (input.is_active != null) { fields.push(`is_active = $${String(paramIdx++)}`); params.push(input.is_active); }

    if (fields.length === 0) return [new Error('update_failed: no fields provided'), null];

    fields.push(`updated_at = NOW()`);
    params.push(providerId);

    const query = `UPDATE providers SET ${fields.join(', ')} WHERE id = $${String(paramIdx)}::uuid RETURNING id, name, email`;
    const rows = await sql.unsafe(query, params) as Array<{ id: string; name: string; email: string }>;
    const row = rows[0];
    if (row == null) return [new Error(`update_failed: provider '${providerId}' not found`), null];

    return [null, {
      ...row,
      honorific_id: input.honorific_id ?? null,
      specialty_id: input.specialty_id ?? null,
      timezone_id: null,
      phone_app: input.phone_app ?? null,
      phone_contact: input.phone_contact ?? null,
      telegram_chat_id: input.telegram_chat_id ?? null,
      gcal_calendar_id: input.gcal_calendar_id ?? null,
      address_street: input.address_street ?? null,
      address_number: input.address_number ?? null,
      address_complement: input.address_complement ?? null,
      address_sector: input.address_sector ?? null,
      region_id: input.region_id ?? null,
      commune_id: input.commune_id ?? null,
      is_active: input.is_active ?? true,
      has_password: true,
      last_password_change: null,
      created_at: '',
      updated_at: new Date().toISOString(),
      honorific_label: null,
      specialty_name: null,
      timezone_name: null,
      region_name: null,
      commune_name: null,
    } as ProviderRow];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`update_failed: ${msg}`), null];
  }
}

// ============================================================================
// RESET PASSWORD (admin generates new temp)
// ============================================================================

async function resetProviderPassword(
  sql: postgres.Sql,
  providerId: string
): Promise<Result<{ readonly provider_id: string; readonly temp_password: string; readonly message: string }>> {
  try {
    const tempPassword = generateReadablePassword(4);
    const passwordHash = await hashPassword(tempPassword);

    await sql`
      UPDATE providers
      SET password_hash = ${passwordHash},
          last_password_change = NOW(),
          updated_at = NOW()
      WHERE id = ${providerId}::uuid
    `;

    return [null, {
      provider_id: providerId,
      temp_password: tempPassword,
      message: `New temp password: ${tempPassword} (expires in 24h, must change on first login)`,
    }];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`reset_password_failed: ${msg}`), null];
  }
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<{
  readonly success: boolean;
  readonly data: unknown | null;
  readonly error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: `Validation error: ${parsed.error.message}` };
  }

  const input = parsed.data;
  const sql = getDb();

  try {
    if (input.action === 'list') {
      const [err, rows] = await listProviders(sql);
      if (err != null) return { success: false, data: null, error_message: err.message };
      const providers = rows ?? [];
      return { success: true, data: { providers, count: providers.length }, error_message: null };
    }

    if (input.action === 'create') {
      const [err, result] = await createProvider(sql, input);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'update') {
      const id = input.provider_id;
      if (id == null) return { success: false, data: null, error_message: 'update_failed: provider_id is required' };
      const [err, result] = await updateProvider(sql, id, input);
      if (err != null) return { success: false, data: null, error_message: err.message };
      return { success: true, data: result, error_message: null };
    }

    if (input.action === 'activate' || input.action === 'deactivate') {
      const id = input.provider_id;
      if (id == null) return { success: false, data: null, error_message: `${input.action}_failed: provider_id is required` };
      const active = input.action === 'activate';
      await sql`UPDATE providers SET is_active = ${active}, updated_at = NOW() WHERE id = ${id}::uuid`;
      return { success: true, data: { provider_id: id, is_active: active }, error_message: null };
    }

    if (input.action === 'reset_password') {
      const id = input.provider_id;
      if (id == null) return { success: false, data: null, error_message: 'reset_password_failed: provider_id is required' };
      const [err, result] = await resetProviderPassword(sql, id);
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
