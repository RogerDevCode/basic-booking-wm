import {
  createConversationRedis,
  getConversationState,
  updateConversationState,
} from '../conversation-state';
import { InputSchema, type UpdateInput, type UpdateOutput } from './types';
import type { Result } from '../result';

export function validateInput(rawInput: unknown): Result<UpdateInput> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(parsed.error.message), null];
  }
  return [null, parsed.data];
}

export async function processConversationUpdate(data: UpdateInput): Promise<Result<boolean>> {
  const { chat_id, intent, entities, flow_step, booking_state, booking_draft, message_id } = data;

  const redis = createConversationRedis();
  if (redis === null) {
    return [null, false];
  }

  try {
    const [getErr, existingState] = await getConversationState(redis, chat_id);
    const entitiesFlat: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(entities)) {
      entitiesFlat[k] = v;
    }
    const [err] = await updateConversationState(
      redis,
      chat_id,
      intent,
      entitiesFlat,
      getErr === null ? existingState : null,
      flow_step,
      booking_state,
      booking_draft,
      message_id,
    );
    if (err !== null) {
      return [err, false];
    }
    return [null, true];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(msg), false];
  } finally {
    await redis.quit().catch(() => { /* ignore */ });
  }
}

export function formatOutput(success: boolean, updated: boolean, error_message: string | null): UpdateOutput {
  return { success, data: { updated }, error_message };
}
