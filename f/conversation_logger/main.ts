// ============================================================================
// CONVERSATION LOGGER — Log messages to conversations table
// ============================================================================
// Called after every incoming/outgoing message to maintain conversation history.
// Channel: telegram, web, api
// Direction: incoming, outgoing
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

const InputSchema = z.object({
  patient_id: z.uuid().optional(),
  channel: z.enum(['telegram', 'web', 'api']),
  direction: z.enum(['incoming', 'outgoing']),
  content: z.string().min(1).max(2000),
  intent: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: { message_id: string } | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: "Validation error: " + parsed.error.message };
  }

  const { patient_id, channel, direction, content, intent, metadata } = parsed.data;

  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const rows = await sql`
      INSERT INTO conversations (patient_id, channel, direction, content, intent, metadata)
      VALUES (
        ${patient_id ?? null}::uuid,
        ${channel},
        ${direction},
        ${content},
        ${intent ?? null},
        ${JSON.stringify(metadata ?? {})}::jsonb
      )
      RETURNING message_id
    `;

    const row: Record<string, unknown> | undefined = rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) {
      return { success: false, data: null, error_message: 'Failed to log conversation' };
    }

    return { success: true, data: { message_id: String(row['message_id']) }, error_message: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: "Internal error: " + message };
  } finally {
    await sql.end();
  }
}
