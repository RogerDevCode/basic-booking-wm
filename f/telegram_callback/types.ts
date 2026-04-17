import { z } from 'zod';

export const InputSchema = z.object({
      callback_query_id: z.string().min(1),
      callback_data: z.string().min(1).max(64),
      chat_id: z.string().min(1),
      message_id: z.string().optional(),
      user_id: z.string().optional(),
    client_id: z.string().optional(),
});

export interface ActionContext {
  botToken: string;
  tenantId: string;
  booking_id: string;
  client_id?: string | undefined;
  chat_id: string;
  callback_query_id: string;
  dbUrl: string;
}

export interface ActionResult {
  responseText: string;
  followUpText: string | null;
}

export interface ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, ActionResult | null]>;
}
