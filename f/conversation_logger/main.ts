// ============================================================================
// CONVERSATION LOGGER — Log messages to conversations table
// ============================================================================
// Called after every incoming/outgoing message to maintain conversation history.
// Channel: telegram, web, api
// Direction: incoming, outgoing
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  client_id: z.uuid().optional(),
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

  const rawObj = typeof rawInput === 'object' && rawInput !== null ? rawInput : {};
  let tenantId = '00000000-0000-0000-0000-000000000000';
  const tenantKeys = ['provider_id', 'user_id', 'admin_user_id', 'client_id', 'client_user_id'] as const;
  for (const key of tenantKeys) {
    const val = (rawObj as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      tenantId = val;
      break;
    }
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
