import { z } from "zod";

export const MessageParserInputSchema = z.object({
  chat_id: z.string().min(1).regex(/^\d+$/, "chat_id must be a positive integer"),
  text: z.string().trim().min(1).max(500),
  user_metadata: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  }).optional(),
}).readonly();

export type MessageParserInput = z.infer<typeof MessageParserInputSchema>;

export interface MessageParserData {
  readonly chat_id: number;
  readonly text: string;
  readonly username: string;
  readonly type: string;
}

export interface MessageParserResponse {
  readonly success: boolean;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly data: MessageParserData | null;
  readonly _meta: {
    readonly source: string;
    readonly timestamp: string;
    readonly workflow_id: string;
    readonly version: string;
  };
}
