/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Log messages to conversations table (incoming/outgoing)
 * DB Tables Used  : conversations
 * Concurrency Risk: NO — single-row INSERT
 * GCal Calls      : NO
 * Idempotency Key : N/A — log entries are inherently non-idempotent
 * RLS Tenant ID   : NO — conversations uses user_id (bigint), not client_id UUID
 * Zod Schemas     : YES — InputSchema validates channel, direction, content
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input (channel, direction, content, optional client_id, intent, metadata)
 * - Extract tenant ID from raw input by scanning known tenant key patterns
 * - INSERT a new row into conversations table with all message data
 * - Return the generated message_id
 *
 * ### Schema Verification
 * - Tables: conversations (message_id, client_id, channel, direction, content, intent, metadata)
 * - Columns: All verified — conversations is a logging table not in §6 core schema but present in the actual database
 *
 * ### Failure Mode Analysis
 * - Scenario 1: DATABASE_URL not configured → return error before any DB call
 * - Scenario 2: INSERT fails (constraint violation, connection error) → return error, no silent swallow
 *
 * ### Concurrency Analysis
 * - Risk: NO — single-row INSERT, no concurrent access concerns
 *
 * ### SOLID Compliance Check
 * - SRP: Single function does one thing — YES (main validates, extracts tenant, inserts, returns)
 * - DRY: No duplicated logic — YES (minimal code, no repeated patterns)
 * - KISS: No unnecessary complexity — YES (straight INSERT with tenant context wrapper)
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  client_id: z.uuid().optional(),
  provider_id: z.uuid().optional(),
  channel: z.enum(['telegram', 'web', 'api']),
  direction: z.enum(['incoming', 'outgoing']),
  content: z.string().min(1).max(2000),
  intent: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export async function main(rawInput: unknown): Promise<[Error | null, { message_id: string } | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  // Tenant ID from validated input — no key scanning, no guesswork
  const tenantId = input.provider_id;
  if (tenantId === undefined) {
    return [new Error('provider_id is required for tenant isolation'), null];
  }

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      const rows = await tx.values<[string][]>`
        INSERT INTO conversations (client_id, channel, direction, content, intent, metadata)
        VALUES (
          ${input.client_id ?? null}::uuid,
          ${input.channel},
          ${input.direction},
          ${input.content},
          ${input.intent ?? null},
          ${JSON.stringify(input.metadata ?? {})}::jsonb
        )
        RETURNING message_id
      `;

      const row = rows[0];
      if (row === undefined) {
        return [new Error('Failed to log conversation'), null];
      }

      return [null, { message_id: row[0] }];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('Conversation logging failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
