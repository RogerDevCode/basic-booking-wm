import postgres from 'postgres';
import { generateReadablePassword, hashPassword } from '../internal/crypto/index.ts';
import type { Result } from '../internal/result/index.ts';
import type { Input, ProviderRow, CreateProviderResult } from './types.ts';

// ============================================================================
// LIST providers with joins
// ============================================================================

export async function listProviders(tx: postgres.Sql): Promise<Result<ProviderRow[]>> {
  try {
    const rows = await tx.values<[
      string, string | null, string, string, string | null, number | null,
      string | null, string | null, string | null, string | null,
      string | null, string | null, string | null, string | null,
      number | null, number | null, boolean, boolean, string | null, string, string,
      string | null, string | null, string | null, string | null, string | null,
    ][]>`
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

    const providers: ProviderRow[] = rows.map((row) => ({
      id: row[0],
      honorific_id: row[1],
      name: row[2],
      email: row[3],
      specialty_id: row[4],
      timezone_id: row[5],
      phone_app: row[6],
      phone_contact: row[7],
      telegram_chat_id: row[8],
      gcal_calendar_id: row[9],
      address_street: row[10],
      address_number: row[11],
      address_complement: row[12],
      address_sector: row[13],
      region_id: row[14],
      commune_id: row[15],
      is_active: row[16],
      has_password: row[17],
      last_password_change: row[18],
      created_at: row[19],
      updated_at: row[20],
      honorific_label: row[21],
      specialty_name: row[22],
      timezone_name: row[23],
      region_name: row[24],
      commune_name: row[25],
    }));

    return [null, providers];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`list_failed: ${msg}`), null];
  }
}

// ============================================================================
// CREATE provider
// ============================================================================

export async function createProvider(
  tx: postgres.Sql,
  input: Readonly<Input>
): Promise<Result<CreateProviderResult>> {
  const name = input.name ?? '';
  const email = input.email ?? '';
  if (name === '' || email === '') {
    return [new Error('create_failed: name and email are required'), null];
  }

  const tempPassword = generateReadablePassword(4);
  const passwordHash = await hashPassword(tempPassword);
  void passwordHash;

  const insertRows = await tx.values<[string, string, string][]>`
    INSERT INTO providers (
      name, email, specialty_id, honorific_id, timezone_id,
      phone_app, phone_contact, telegram_chat_id, gcal_calendar_id,
      address_street, address_number, address_complement, address_sector,
      region_id, commune_id, is_active, password_hash, last_password_change
    ) VALUES (
      \${name}, \${email}, \${input.specialty_id ?? null}, \${input.honorific_id ?? null}, \${input.timezone_id ?? null},
      \${input.phone_app ?? null}, \${input.phone_contact ?? null}, \${input.telegram_chat_id ?? null}, \${input.gcal_calendar_id ?? null},
      \${input.address_street ?? null}, \${input.address_number ?? null}, \${input.address_complement ?? null}, \${input.address_sector ?? null},
      \${input.region_id ?? null}, \${input.commune_id ?? null}, \${input.is_active ?? true}, \${passwordHash}, NOW()
    )
    RETURNING id, name, email
  `;

  const row = insertRows[0];
  if (row === undefined) {
    return [new Error('create_failed: no row returned'), null];
  }

  const result: CreateProviderResult = {
    id: row[0],
    name: row[1],
    email: row[2],
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
  };

  return [null, result];
}

// ============================================================================
// UPDATE provider
// ============================================================================

export async function updateProvider(
  tx: postgres.Sql,
  providerId: string,
  input: Readonly<Input>
): Promise<Result<ProviderRow>> {
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  const paramIdx = 1;
  void paramIdx;

  if (input.name != null) { fields.push(`name = $\${String(paramIdx++)}`); params.push(input.name); }
  if (input.email != null) { fields.push(`email = $\${String(paramIdx++)}`); params.push(input.email); }
  if (input.specialty_id != null) { fields.push(`specialty_id = $\${String(paramIdx++)}::uuid`); params.push(input.specialty_id); }
  if (input.honorific_id != null) { fields.push(`honorific_id = $\${String(paramIdx++)}::uuid`); params.push(input.honorific_id); }
  if (input.timezone_id != null) { fields.push(`timezone_id = $\${String(paramIdx++)}`); params.push(input.timezone_id); }
  if (input.phone_app != null) { fields.push(`phone_app = $\${String(paramIdx++)}`); params.push(input.phone_app); }
  if (input.phone_contact != null) { fields.push(`phone_contact = $\${String(paramIdx++)}`); params.push(input.phone_contact); }
  if (input.telegram_chat_id != null) { fields.push(`telegram_chat_id = $\${String(paramIdx++)}`); params.push(input.telegram_chat_id); }
  if (input.gcal_calendar_id != null) { fields.push(`gcal_calendar_id = $\${String(paramIdx++)}`); params.push(input.gcal_calendar_id); }
  if (input.address_street != null) { fields.push(`address_street = $\${String(paramIdx++)}`); params.push(input.address_street); }
  if (input.address_number != null) { fields.push(`address_number = $\${String(paramIdx++)}`); params.push(input.address_number); }
  if (input.address_complement != null) { fields.push(`address_complement = $\${String(paramIdx++)}`); params.push(input.address_complement); }
  if (input.address_sector != null) { fields.push(`address_sector = $\${String(paramIdx++)}`); params.push(input.address_sector); }
  if (input.region_id != null) { fields.push(`region_id = $\${String(paramIdx++)}`); params.push(input.region_id); }
  if (input.commune_id != null) { fields.push(`commune_id = $\${String(paramIdx++)}`); params.push(input.commune_id); }
  if (input.is_active != null) { fields.push(`is_active = $\${String(paramIdx++)}`); params.push(input.is_active); }

  if (fields.length === 0) return [new Error('update_failed: no fields provided'), null];

  fields.push(`updated_at = NOW()`);
  params.push(providerId);

  const query = `UPDATE providers SET \${fields.join(', ')} WHERE id = $\${String(paramIdx)}::uuid RETURNING id, name, email`;
  const rows = await tx.values<[string, string, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error(`update_failed: provider '\${providerId}' not found`), null];

  const result: ProviderRow = {
    id: row[0],
    name: row[1],
    email: row[2],
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
  };

  return [null, result];
}

// ============================================================================
// RESET PASSWORD (admin generates new temp)
// ============================================================================

export async function resetProviderPassword(
  tx: postgres.Sql,
  providerId: string
): Promise<Result<{ readonly provider_id: string; readonly temp_password: string; readonly message: string }>> {
  const tempPassword = generateReadablePassword(4);
  const passwordHash = await hashPassword(tempPassword);
  void passwordHash;

  await tx`
    UPDATE providers
    SET password_hash = \${passwordHash},
        last_password_change = NOW(),
        updated_at = NOW()
    WHERE id = \${providerId}::uuid
  `;

  return [null, {
    provider_id: providerId,
    temp_password: tempPassword,
    message: `New temp password: \${tempPassword} (expires in 24h, must change on first login)`,
  }];
}
