/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Display main menu with persistent reply keyboard
 * DB Tables Used  : NONE — pure menu routing handler
 * Concurrency Risk: NO — stateless menu display
 * GCal Calls      : NO
 * Idempotency Key : N/A — menu display is idempotent
 * RLS Tenant ID   : NO — stateless utility
 * Zod Schemas     : YES — InputSchema validates chat_id and user_id
 */

import { InputSchema, type Input, type MenuResult } from './types';
import { handleShowMenu, handleSelectOption } from './services';

export function main(rawInput: unknown): MenuResult {
  try {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        data: null,
        error_message: parsed.error.message,
      };
    }

    const input: Input = parsed.data;

    if (input.action === 'show' || input.action === 'start') {
      return handleShowMenu(input);
    }

    if (input.action === 'select_option') {
      return handleSelectOption(input);
    }

    return {
      success: false,
      data: null,
      error_message: `Unknown action: ${String(input.action)}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      data: null,
      error_message: message,
    };
  }
}