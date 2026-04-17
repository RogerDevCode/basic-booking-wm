/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Provider self-service profile management (get/update/change password)
 * DB Tables Used  : providers, honorifics, specialties, timezones, regions, communes
 * Concurrency Risk: NO — single-row SELECT/UPDATE
 * GCal Calls      : NO
 * Idempotency Key : N/A — profile updates are inherently idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates action and provider fields
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Refactor provider profile management using SOLID principles.
 * - Separate concerns: input validation, action routing (Strategy), and database operations (Repository).
 * - Ensure Go-style error handling throughout.
 *
 * ### Schema Verification
 * - Tables: providers, honorifics, specialties, timezones, regions, communes.
 * - Columns: p.id, p.name, p.email, h.label, s.name, t.name, p.phone_app, p.phone_contact,
 *   p.telegram_chat_id, p.gcal_calendar_id, p.address_street, p.address_number,
 *   p.address_complement, p.address_sector, r.name, c.name, p.is_active, p.password_hash.
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Database connection failure -> Handled in main() catch block.
 * - Scenario 2: Validation failure -> Handled by Zod safeParse.
 * - Scenario 3: Unauthorized transition/action -> Handled by Handler Registry.
 * - Scenario 4: RLS violation -> Enforced by withTenantContext.
 *
 * ### SOLID Compliance Check
 * - SRP: Validation, Routing, and DB operations are strictly separated.
 * - OCP: Adding new actions (e.g., 'update_avatar') requires adding to HANDLERS map, no change to main loop.
 * - LSP: All handlers share the ProfileActionHandler interface.
 * - ISP: Interfaces are focused and lean.
 * - DIP: Handlers depend on the sql client abstraction injected at runtime.
 *
 * → CLEARED FOR CODE GENERATION
 */

import "@total-typescript/ts-reset";
import { z } from 'zod';
import postgres from 'postgres';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../internal/crypto';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ============================================================================
// SCHEMAS & TYPES
// ============================================================================

const InputSchema = z.object({
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

type ProfileInput = Readonly<z.infer<typeof InputSchema>>;

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

type ProfileActionHandler = (
  sql: postgres.Sql,
  input: ProfileInput
) => Promise<Result<unknown>>;

// ============================================================================
// REPOSITORY (Database Operations)
// ============================================================================

const ProfileRepository = {
  async findById(sql: postgres.Sql, providerId: string): Promise<Result<ProfileRow>> {
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
    if (row === undefined) return [new Error('profile_not_found'), null];

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
  },

  async update(sql: postgres.Sql, providerId: string, data: Partial<ProfileInput>): Promise<Result<void>> {
    // Filter out undefined and non-db fields
    const allowedFields = [
      'name', 'email', 'phone_app', 'phone_contact', 'telegram_chat_id',
      'gcal_calendar_id', 'address_street', 'address_number',
      'address_complement', 'address_sector', 'region_id', 'commune_id'
    ] as const;

    const updateSet: Record<string, unknown> = {
      updated_at: sql`NOW()`
    };

    let hasChanges = false;
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateSet[key] = data[key];
        hasChanges = true;
      }
    }

    if (!hasChanges) return [new Error('no_changes_provided'), null];

    try {
      await sql`
        UPDATE providers
        SET ${sql(updateSet)}
        WHERE id = ${providerId}::uuid
      `;
      return [null, undefined];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return [new Error(`update_failed: ${msg}`), null];
    }
  },

  async getPasswordHash(sql: postgres.Sql, providerId: string): Promise<Result<string>> {
    const rows = await sql`SELECT password_hash FROM providers WHERE id = ${providerId}::uuid LIMIT 1`;
    const row = rows[0];
    if (row === undefined) return [new Error('provider_not_found'), null];
    if (row['password_hash'] === null) return [new Error('no_password_set'), null];
    return [null, row['password_hash'] as string];
  },

  async updatePassword(sql: postgres.Sql, providerId: string, newHash: string): Promise<Result<void>> {
    await sql`
      UPDATE providers
      SET password_hash = ${newHash},
          last_password_change = NOW(),
          updated_at = NOW()
      WHERE id = ${providerId}::uuid
    `;
    return [null, undefined];
  }
};

// ============================================================================
// STRATEGY HANDLERS
// ============================================================================

const HANDLERS: Record<z.infer<typeof InputSchema>['action'], ProfileActionHandler> = {
  async get_profile(sql, input) {
    return ProfileRepository.findById(sql, input.provider_id);
  },

  async update_profile(sql, input) {
    const [updateErr] = await ProfileRepository.update(sql, input.provider_id, input);
    if (updateErr !== null) return [updateErr, null];

    return ProfileRepository.findById(sql, input.provider_id);
  },

  async change_password(sql, input) {
    const { current_password, new_password } = input;
    if (!current_password || !new_password) {
      return [new Error('missing_password_fields'), null];
    }

    // 1. Validate Policy
    const policy = validatePasswordPolicy(new_password);
    if (!policy.valid) {
      return [new Error(`policy_violation: ${policy.errors.join(', ')}`), null];
    }

    // 2. Verify Current
    const [hashErr, currentHash] = await ProfileRepository.getPasswordHash(sql, input.provider_id);
    if (hashErr !== null) return [hashErr, null];

    const isValid = await verifyPassword(current_password, currentHash!);
    if (!isValid) return [new Error('invalid_current_password'), null];

    // 3. Update
    const newHash = await hashPassword(new_password);
    const [updErr] = await ProfileRepository.updatePassword(sql, input.provider_id, newHash);
    if (updErr !== null) return [updErr, null];

    return [null, { success: true, message: 'password_changed' }];
  }
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(rawInput: unknown): Promise<Result<unknown>> {
  // 1. Validate Input
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) return [new Error('configuration_error: DATABASE_URL missing'), null];

  const sql = createDbClient({ url: dbUrl });

  try {
    // 2. Execute within Tenant Context
    return await withTenantContext(sql, input.provider_id, async (tx) => {
      const handler = HANDLERS[input.action];
      if (!handler) {
        return [new Error(`unsupported_action: ${input.action}`), null];
      }
      return handler(tx, input);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return [new Error(`internal_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}
