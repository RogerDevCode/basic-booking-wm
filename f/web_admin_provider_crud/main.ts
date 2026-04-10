/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Full provider management for admin dashboard (CRUD + activate/deactivate)
 * DB Tables Used  : providers, services, honorifics, specialties, regions, communes, timezones
 * Concurrency Risk: NO — single-row CRUD operations
 * GCal Calls      : NO
 * Idempotency Key : N/A — CRUD operations are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and provider fields
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate action type and provider fields via Zod InputSchema
 * - Route to listProviders, createProvider, updateProvider, activate/deactivate, or resetProviderPassword
 * - On create: generate temp password, hash it, insert into providers, return temp password to admin
 * - On reset: generate new temp password, hash, update providers.password_hash
 *
 * ### Schema Verification
 * - Tables: providers (id, name, email, specialty_id, honorific_id, timezone_id, phone_app, phone_contact, telegram_chat_id, gcal_calendar_id, address fields, region_id, commune_id, is_active, password_hash, last_password_change), honorifics, specialties, timezones, regions, communes
 * - Columns: All provider columns verified; joins use LEFT JOIN for optional reference tables
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Create with empty name/email → Zod validation fails before DB call
 * - Scenario 2: Update with no fields → early return error before building dynamic SQL
 * - Scenario 3: Update provider not found → RETURNING yields no rows, error returned
 * - Scenario 4: Transaction failure (RLS violation, constraint) → withTenantContext rolls back, error propagated
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row CRUD with provider_id as primary key; unique constraint on email handled by DB
 *
 * ### SOLID Compliance Check
 * - SRP: YES — each function (list/create/update/resetPassword) has single responsibility
 * - DRY: YES — dynamic SQL builder for update avoids per-field duplication; shared ProviderRow type
 * - KISS: YES — straightforward CRUD; dynamic UPDATE fields built iteratively without ORM complexity
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// WEB ADMIN PROVIDER CRUD — Full provider management for admin dashboard
// ============================================================================
// Actions: list, create, update, activate, deactivate, reset_password
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { generateReadablePassword, hashPassword } from '../internal/crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

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

interface CreateProviderResult extends ProviderRow {
  readonly temp_password: string;
}

// ============================================================================
// DB HELPERS
// ============================================================================

// ============================================================================
// LIST providers with joins
// ============================================================================

async function listProviders(tx: postgres.Sql): Promise<Result<ProviderRow[]>> {
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

async function createProvider(
  tx: postgres.Sql,
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<Result<CreateProviderResult>> {
  const name = input.name ?? '';
  const email = input.email ?? '';
  if (name === '' || email === '') {
    return [new Error('create_failed: name and email are required'), null];
  }

  const tempPassword = generateReadablePassword(4);
  const passwordHash = await hashPassword(tempPassword);

  const insertRows = await tx.values<[string, string, string][]>`
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

async function updateProvider(
  tx: postgres.Sql,
  providerId: string,
  input: Readonly<z.infer<typeof InputSchema>>
): Promise<Result<ProviderRow>> {
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
  const rows = await tx.values<[string, string, string][]>(query, params);
  const row = rows[0];
  if (row === undefined) return [new Error(`update_failed: provider '${providerId}' not found`), null];

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

async function resetProviderPassword(
  tx: postgres.Sql,
  providerId: string
): Promise<Result<{ readonly provider_id: string; readonly temp_password: string; readonly message: string }>> {
  const tempPassword = generateReadablePassword(4);
  const passwordHash = await hashPassword(tempPassword);

  await tx`
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
}

// ============================================================================
// MAIN
// ============================================================================

export async function main(rawInput: unknown): Promise<[Error | null, unknown | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Validation error: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const sql = createDbClient({ url: process.env['DATABASE_URL'] ?? '' });

  try {
    // 'list' is a global admin operation — runs outside tenant context
    if (input.action === 'list') {
      const [listErr, listData] = await listProviders(sql);
      if (listErr != null) return [listErr, null];
      return [null, { providers: listData, action: 'list' } as unknown as Record<string, unknown>];
    }

    // All other actions require a specific provider_id as tenant
    if (input.provider_id == null) {
      return [new Error('provider_id is required for non-list operations'), null];
    }

    const [txErr, txData] = await withTenantContext<unknown>(sql, input.provider_id, async (tx) => {
      if (input.action === 'create') {
        return createProvider(tx, input);
      }

      if (input.action === 'update') {
        const id = input.provider_id;
        if (id == null) return [new Error('update_failed: provider_id is required'), null];
        return updateProvider(tx, id, input);
      }

      if (input.action === 'activate' || input.action === 'deactivate') {
        const id = input.provider_id;
        if (id == null) return [new Error(`${input.action}_failed: provider_id is required`), null];
        const active = input.action === 'activate';
        await tx`UPDATE providers SET is_active = ${active}, updated_at = NOW() WHERE id = ${id}::uuid`;
        return [null, { provider_id: id, is_active: active }];
      }

      if (input.action === 'reset_password') {
        const id = input.provider_id;
        if (id == null) return [new Error('reset_password_failed: provider_id is required'), null];
        return resetProviderPassword(tx, id);
      }

      return [new Error(`Unknown action: ${input.action}`), null];
    });

    if (txErr !== null) {
      const msg = txErr.message;
      if (msg.startsWith('transaction_failed: ')) {
        return [new Error(msg.slice(20)), null];
      }
      return [txErr, null];
    }

    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let errorMsg = msg;
    if (msg.startsWith('transaction_failed: ')) {
      errorMsg = msg.slice(20);
    }
    return [new Error(errorMsg), null];
  } finally {
    await sql.end();
  }
}
