/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Client profile CRUD (get/update)
 * DB Tables Used  : clients, users
 * Concurrency Risk: NO — single-row SELECT/UPDATE
 * GCal Calls      : NO
 * Idempotency Key : N/A — profile updates are inherently idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates user_id and profile fields
 */

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext, type TxClient } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

// ============================================================================
// WEB PATIENT PROFILE — Client profile CRUD
// ============================================================================

const InputSchema = z.object({
  user_id: z.uuid(),
  action: z.enum(['get', 'update']).default('get'),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(), // Improved email validation
  phone: z.string().max(50).optional(),
  timezone: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;

interface ProfileResult {
  readonly client_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly gcal_calendar_id: string | null;
}

/**
 * Main entry point for patient profile operations.
 * Orchestrates user lookup, client creation/retrieval, and updates.
 */
export async function main(rawInput: unknown): Promise<Result<ProfileResult>> {
  /*
   * ## REASONING TRACE
   * ### Mission Decomposition
   * - Validate input via Zod (InputSchema).
   * - Establish DB connection using env vars.
   * - Execute operations within withTenantContext (RLS protection).
   * - SRP: Decompose into findUser, findOrCreateClient, and updateProfile logic.
   *
   * ### Schema Verification
   * - Tables: users, clients (matching §6 + migrations).
   *
   * ### Failure Mode Analysis
   * - Invalid input → Zod returns error.
   * - Missing DB URL → Configuration error.
   * - User not found → Logical error returned.
   * - DB execution error → Caught and returned as Result.
   *
   * ### SOLID Compliance Check
   * - SRP: Business logic extracted from the main coordinator.
   * - DRY: Shared Result type and withTenantContext used.
   * - KISS: Clear flow from validation to execution to response.
   */

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is not set'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [err, data] = await withTenantContext(sql, parsed.data.user_id, async (tx) => {
      // 1. Resolve User
      const [uErr, user] = await findUser(tx, parsed.data.user_id);
      if (uErr !== null) return [uErr, null];

      // 2. Find or Auto-Create Client
      const [cErr, client] = await findOrCreateClient(tx, parsed.data.user_id, user!);
      if (cErr !== null) return [cErr, null];

      let finalClient = client!;

      // 3. Optional Update
      if (parsed.data.action === 'update') {
        const [upErr, updated] = await updateProfile(tx, finalClient['client_id'] as string, parsed.data);
        if (upErr !== null) return [upErr, null];
        finalClient = updated!;
      }

      return [null, mapToProfileResult(finalClient)];
    });

    return [err, data];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error(`FATAL_ERROR: ${message}`), null];
  } finally {
    await sql.end();
  }
}

// ============================================================================
// HELPER FUNCTIONS — SRP focused logic
// ============================================================================

/**
 * Fetches user metadata to facilitate client auto-creation.
 */
async function findUser(tx: TxClient, userId: string): Promise<Result<postgres.Row>> {
  try {
    const rows = await tx`
      SELECT user_id, email, full_name, phone, telegram_chat_id, timezone
      FROM users 
      WHERE user_id = ${userId}::uuid 
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return [new Error('User not found'), null];
    return [null, user];
  } catch (err) {
    return [new Error(`DB_FETCH_ERROR (users): ${String(err)}`), null];
  }
}

/**
 * Ensures a client record exists, either by finding it or creating from user data.
 */
async function findOrCreateClient(
  tx: TxClient,
  userId: string,
  user: postgres.Row
): Promise<Result<postgres.Row>> {
  try {
    const userEmail = String(user['email']);
    const clientRows = await tx`
      SELECT client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
      FROM clients
      WHERE client_id = ${userId}::uuid OR email = ${userEmail}
      LIMIT 1
    `;

    if (clientRows[0]) {
      return [null, clientRows[0]];
    }

    // Auto-create client from user profile
    const createRows = await tx`
      INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
      VALUES (
        ${String(user['full_name'])},
        ${userEmail !== 'null' ? userEmail : null},
        ${user['phone'] !== null ? String(user['phone']) : null},
        ${user['telegram_chat_id'] !== null ? String(user['telegram_chat_id']) : null},
        ${String(user['timezone'])}
      )
      RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
    `;

    if (!createRows[0]) {
      return [new Error('Failed to create client record'), null];
    }

    return [null, createRows[0]];
  } catch (err) {
    return [new Error(`DB_WRITE_ERROR (clients): ${String(err)}`), null];
  }
}

/**
 * Performs a dynamic update on the client profile.
 */
async function updateProfile(
  tx: TxClient,
  clientId: string,
  data: Partial<Omit<Input, 'user_id' | 'action'>>
): Promise<Result<postgres.Row>> {
  try {
    const updates: string[] = [];
    const values: string[] = [];

    // Map allowed fields to SQL updates
    const fieldMap: Record<string, keyof typeof data> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      timezone: 'timezone'
    };

    for (const [col, key] of Object.entries(fieldMap)) {
      const val = data[key];
      if (val !== undefined) {
        updates.push(`${col} = $${values.length + 1}`);
        values.push(val);
      }
    }

    if (updates.length === 0) {
      const rows = await tx`SELECT * FROM clients WHERE client_id = ${clientId}::uuid`;
      return [null, rows[0] ?? null];
    }

    updates.push('updated_at = NOW()');
    const queryText = `
      UPDATE clients 
      SET ${updates.join(', ')} 
      WHERE client_id = $${values.length + 1}::uuid 
      RETURNING client_id, name, email, phone, telegram_chat_id, timezone, gcal_calendar_id
    `;
    values.push(clientId);

    const result = await tx.unsafe(queryText, values);
    if (!result[0]) {
      return [new Error('Update failed: client record missing after write'), null];
    }

    return [null, result[0]];
  } catch (err) {
    return [new Error(`DB_UPDATE_ERROR (clients): ${String(err)}`), null];
  }
}

/**
 * Maps raw database row to strictly typed ProfileResult.
 */
function mapToProfileResult(row: postgres.Row): ProfileResult {
  return {
    client_id: String(row['client_id']),
    name: String(row['name']),
    email: row['email'] ? String(row['email']) : null,
    phone: row['phone'] ? String(row['phone']) : null,
    telegram_chat_id: row['telegram_chat_id'] ? String(row['telegram_chat_id']) : null,
    timezone: String(row['timezone']),
    gcal_calendar_id: row['gcal_calendar_id'] ? String(row['gcal_calendar_id']) : null,
  };
}
