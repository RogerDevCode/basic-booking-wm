import { z } from 'zod';
import type { ConversationState } from '../conversation-state/index';

export const InputSchema = z.object({
  chat_id: z.string().min(1),
}).readonly();

export type ChatId = z.infer<typeof InputSchema>['chat_id'];

export interface GetStateOutput {
  readonly success: boolean;
  readonly data: ConversationState | null;
  readonly error_message: string | null;
  readonly redis_connected: boolean;
}

export interface FetchResult {
  readonly data: ConversationState | null;
  readonly redis_connected: boolean;
}
