import { createConversationRedis, getConversationState, type ConversationState } from '../conversation-state/index';
import type { Result } from '../result/index';
import { InputSchema, type ChatId, type GetStateOutput, type FetchResult } from './types';

export function validateInput(rawInput: unknown): Result<ChatId> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(parsed.error.message), null];
  }
  return [null, parsed.data.chat_id];
}

export async function fetchConversationData(chatId: string): Promise<Result<FetchResult>> {
  const redis = createConversationRedis();
  
  if (redis === null) {
    return [null, { data: null, redis_connected: false }];
  }

  try {
    const [err, state] = await getConversationState(redis, chatId);
    
    if (err !== null) {
      return [err, { data: null, redis_connected: true }];
    }

    return [null, { data: state, redis_connected: true }];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return [new Error(`redis_operation_failed: ${msg}`), { data: null, redis_connected: true }];
  } finally {
    if (redis !== null) {
      void redis.quit().catch(() => { /* skip log on cleanup failure */ });
    }
  }
}

export function formatOutput(
  success: boolean,
  data: ConversationState | null,
  errorMessage: string | null,
  redisConnected: boolean
): GetStateOutput {
  return {
    success,
    data,
    error_message: errorMessage,
    redis_connected: redisConnected,
  };
}
