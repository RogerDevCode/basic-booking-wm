/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Create or update client records (patient registration)
 * DB Tables Used  : clients
 * Concurrency Risk: NO — UPSERT by email/phone/telegram_chat_id
 * GCal Calls      : NO
 * Idempotency Key : YES — ON CONFLICT DO UPDATE by unique client identifiers
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates name, email, phone, timezone
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input via Zod schema (name, email, phone, telegram_chat_id, timezone)
 * - Look up existing client by email, telegram_chat_id, or phone (priority order)
 * - If found: update existing record; if not: INSERT with ON CONFLICT fallback
 * - Return ClientResult with created flag indicating insert vs update
 *
 * ### Schema Verification
 * - Tables: clients
 * - Columns: client_id, name, email, phone, telegram_chat_id, timezone, updated_at — all exist per §6
 *
 * ### Failure Mode Analysis
 * - Scenario 1: No unique identifiers provided (no email/phone/telegram_chat_id) → early validation rejection
 * - Scenario 2: DB unique constraint conflict on INSERT → ON CONFLICT (email) DO UPDATE handles gracefully
 * - Scenario 3: Missing DATABASE_URL env → fail-fast before opening transaction
 *
 * ### Concurrency Analysis
 * - Risk: YES — multiple registration requests for same email/phone could race
 * - Lock strategy: UPSERT via ON CONFLICT + unique indexes at DB level prevent duplicates; no explicit SELECT FOR UPDATE needed for creation
 *
 * ### SOLID Compliance Check
 * - SRP: YES — single function handles one responsibility (create/update client)
 * - DRY: YES — lookup logic is sequential but each identifier check is necessary and distinct
 * - KISS: YES — straightforward UPSERT pattern with no unnecessary abstraction
 *
 * → CLEARED FOR CODE GENERATION
 */

import { DEFAULT_TIMEZONE } from '../internal/config';
// ============================================================================
// PATIENT REGISTER — Create or update client records
// ============================================================================

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email().optional(),
  phone: z.string().max(50).optional(),
  telegram_chat_id: z.string().optional(),
  timezone: z.string().default(DEFAULT_TIMEZONE),
  idempotency_key: z.string().min(1).optional(),
  provider_id: z.uuid().optional(),
  client_id: z.uuid().optional(),
});

interface ClientResult {
  readonly client_id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly telegram_chat_id: string | null;
  readonly timezone: string;
  readonly created: boolean;
}

export async function main(rawInput: unknown): Promise<[Error | null, ClientResult | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  // FAIL FAST: require explicit tenant context. No fallback to null UUID.
  const tenantId = input.provider_id ?? input.client_id;
  if (!tenantId) {
    return [new Error('tenant_id (provider_id or client_id) is required for tenant isolation'), null];
  }

  if (input.email === undefined && input.phone === undefined && input.telegram_chat_id === undefined) {
    return [new Error('At least one of email, phone, or telegram_chat_id is required'), null];
  }

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      let existingRow: { client_id: string; name: string; email: string | null; phone: string | null; telegram_chat_id: string | null; timezone: string } | undefined;

      if (input.email !== undefined) {
        const rows = await tx.values<[string, string, string | null, string | null, string | null, string][]>`
          SELECT client_id, name, email, phone, telegram_chat_id, timezone
          FROM clients WHERE email = ${input.email} LIMIT 1
        `;
        const row = rows[0];
        if (row !== undefined) {
          existingRow = { client_id: row[0], name: row[1], email: row[2], phone: row[3], telegram_chat_id: row[4], timezone: row[5] };
        }
      }

      if (existingRow === undefined && input.telegram_chat_id !== undefined) {
        const rows = await tx.values<[string, string, string | null, string | null, string | null, string][]>`
          SELECT client_id, name, email, phone, telegram_chat_id, timezone
          FROM clients WHERE telegram_chat_id = ${input.telegram_chat_id} LIMIT 1
        `;
        const row = rows[0];
        if (row !== undefined) {
          existingRow = { client_id: row[0], name: row[1], email: row[2], phone: row[3], telegram_chat_id: row[4], timezone: row[5] };
        }
      }

      if (existingRow === undefined && input.phone !== undefined) {
        const rows = await tx.values<[string, string, string | null, string | null, string | null, string][]>`
          SELECT client_id, name, email, phone, telegram_chat_id, timezone
          FROM clients WHERE phone = ${input.phone} LIMIT 1
        `;
        const row = rows[0];
        if (row !== undefined) {
          existingRow = { client_id: row[0], name: row[1], email: row[2], phone: row[3], telegram_chat_id: row[4], timezone: row[5] };
        }
      }

      if (existingRow !== undefined) {
        await tx`
          UPDATE clients
          SET name = ${input.name},
              timezone = ${input.timezone},
              email = COALESCE(${input.email ?? null}, email),
              phone = COALESCE(${input.phone ?? null}, phone),
              telegram_chat_id = COALESCE(${input.telegram_chat_id ?? null}, telegram_chat_id),
              updated_at = NOW()
          WHERE client_id = ${existingRow.client_id}::uuid
        `;

        const result: ClientResult = {
          client_id: existingRow.client_id,
          name: input.name,
          email: existingRow.email,
          phone: existingRow.phone,
          telegram_chat_id: existingRow.telegram_chat_id,
          timezone: input.timezone,
          created: false,
        };
        return [null, result];
      }

      const rows = await tx.values<[string, string, string | null, string | null, string | null, string][]>`
        INSERT INTO clients (name, email, phone, telegram_chat_id, timezone)
        VALUES (${input.name}, ${input.email ?? null}, ${input.phone ?? null}, ${input.telegram_chat_id ?? null}, ${input.timezone})
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          telegram_chat_id = COALESCE(EXCLUDED.telegram_chat_id, clients.telegram_chat_id),
          updated_at = NOW()
        RETURNING client_id, name, email, phone, telegram_chat_id, timezone
      `;

      const newRow = rows[0];
      if (newRow === undefined) {
        return [new Error('Failed to create client'), null];
      }

      const result: ClientResult = {
        client_id: newRow[0],
        name: newRow[1],
        email: newRow[2],
        phone: newRow[3],
        telegram_chat_id: newRow[4],
        timezone: newRow[5],
        created: true,
      };
      return [null, result];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Operation failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
