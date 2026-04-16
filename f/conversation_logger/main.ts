/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Log messages to conversations table (incoming/outgoing)
 * DB Tables Used  : conversations
 * Concurrency Risk: NO — single-row INSERT
 * GCal Calls      : NO
 * Idempotency Key : N/A — log entries are inherently non-idempotent
 * RLS Tenant ID   : YES — inserts provider_id as tenant context
 * Zod Schemas     : YES — InputSchema validates channel, direction, content
 */

/**
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate raw input against InputSchema.
 * - Establish DB connection and execute within tenant context for RLS compliance.
 * - Decouple insert logic into a dedicated pure function.
 * - Ensure all error paths return Result<T> tuples per §1.A.3.
 *
 * ### SOLID Compliance
 * - S: Separated input validation, DB orchestration, and data persistence.
 * - O: Schema and insert function are easily extendable.
 * - L: Adheres to TxClient interface for database operations.
 * - I: Minimal dependencies and focused function signatures.
 * - D: Depends on abstractions (Result, TxClient, createDbClient).
 *
 * ### Failure Mode Analysis
 * - Configuration: DATABASE_URL missing.
 * - Validation: Malformed UUIDs or invalid enums.
 * - Persistence: Database down or constraint violation.
 *
 * → CLEARED FOR CODE GENERATION
 */

import { z } from 'zod';
import { withTenantContext } from '../internal/tenant-context';
import type { TxClient } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';
import type { Result } from '../internal/result';

/**
 * Input validation schema.
 * Mandates provider_id for RLS context per §12.3.
 */
const InputSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  provider_id: z.string().uuid(),
  channel: z.enum(['telegram', 'web', 'api']),
  direction: z.enum(['incoming', 'outgoing']),
  content: z.string().min(1).max(2000),
  intent: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

type Input = Readonly<z.infer<typeof InputSchema>>;

/**
 * Persists the conversation message to the database.
 * Pure persistence logic following SRP.
 */
async function persistLog(
  tx: TxClient,
  input: Input
): Promise<Result<{ message_id: string }>> {
  try {
    const rows = await tx<Array<{ message_id: string }>>`
      INSERT INTO conversations (
        client_id,
        channel,
        direction,
        content,
        intent,
        metadata
      ) VALUES (
        ${input.client_id ?? null},
        ${input.channel},
        ${input.direction},
        ${input.content},
        ${input.intent ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      ) RETURNING message_id
    `;

    const row = rows[0];
    if (!row) {
      return [new Error('db_insert_failed: No message_id returned from insert'), null];
    }

    return [null, { message_id: row.message_id }];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [new Error(`persistence_error: ${msg}`), null];
  }
}

/**
 * Windmill main entry point.
 * Orchestrates validation, connection management, and RLS context.
 */
export async function main(rawInput: unknown): Promise<Result<{ message_id: string }>> {
  // 1. Validate Input strictly
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }
  const input = parsed.data;

  // 2. Resolve Environment
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    return [new Error('config_error: DATABASE_URL is missing'), null];
  }

  // 3. Initialize DB Connection
  const sql = createDbClient({ url: dbUrl });

  try {
    // 4. Execute within RLS Tenant Context
    // AGENTS.md §12.4: All DB operations MUST flow through withTenantContext.
    const [txErr, txData] = await withTenantContext(
      sql,
      input.provider_id,
      async (tx) => persistLog(tx, input)
    );

    if (txErr !== null) {
      return [txErr, null];
    }

    if (txData === null) {
      return [new Error('orchestration_error: Data returned from transaction was null'), null];
    }

    return [null, txData];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [new Error(`orchestration_error: ${msg}`), null];
  } finally {
    // 5. Always release pool resources
    await sql.end();
  }
}
