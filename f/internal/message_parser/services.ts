import { MessageParserInputSchema, type MessageParserInput, type MessageParserResponse } from './types';
import type { Result } from '../result/index';

export const CONSTANTS = {
  SOURCE: "NN_02_Message_Parser",
  WORKFLOW_ID: "message-parser-v1",
  VERSION: "2.2.0"
} as const;

export function validateInput(rawInput: unknown): Result<MessageParserInput> {
  const parsedInput = MessageParserInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return [new Error(parsedInput.error.message), null];
  }
  return [null, parsedInput.data];
}

export function constructUsername(user_metadata?: MessageParserInput['user_metadata']): string {
  let constructedName = "Usuario";
  if (user_metadata != null) {
    if (user_metadata.first_name != null) {
      constructedName = user_metadata.first_name;
      if (user_metadata.last_name != null) {
        constructedName += ` ${user_metadata.last_name}`;
      }
    } else if (user_metadata.username != null) {
      constructedName = user_metadata.username;
    }
  }
  return constructedName;
}

export function sanitizeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('\'', "''")
    .slice(0, 500);
}

export function createErrorResponse(errorMessage: string): MessageParserResponse {
  return {
    success: false,
    error_code: 'VALIDATION_ERROR',
    error_message: errorMessage,
    data: null,
    _meta: { 
      source: CONSTANTS.SOURCE,
      timestamp: new Date().toISOString(),
      workflow_id: CONSTANTS.WORKFLOW_ID,
      version: CONSTANTS.VERSION
    }
  };
}

export function createSuccessResponse(chatIdNum: number, safeText: string, constructedName: string): MessageParserResponse {
  return {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      chat_id: chatIdNum,
      text: safeText,
      username: constructedName,
      type: 'text'
    },
    _meta: { 
      source: CONSTANTS.SOURCE,
      timestamp: new Date().toISOString(),
      workflow_id: CONSTANTS.WORKFLOW_ID,
      version: CONSTANTS.VERSION
    }
  };
}
