import type { TxClient } from '../internal/tenant-context';
import type { Result } from '../internal/result';
import type { Input, LogResult } from './types';

export async function persistLog(
  tx: TxClient,
  input: Input
): Promise<Result<LogResult>> {
  try {
    const rows = await tx.values<[string]>`
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

    return [null, { message_id: row[0] ?? '' }];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [new Error(`persistence_error: ${msg}`), null];
  }
}