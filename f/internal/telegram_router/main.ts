/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Deterministic Telegram router with InlineKeyboard callback support (Refactored split monolith)
 * DB Tables Used  : None in base route; services/providers/bookings when FSM wizard is active (internal connection)
 * Concurrency Risk: NO — read-only data queries in wizard mode
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only routing
 * RLS Tenant ID   : NO — wizard creates its own connection
 * Zod Schemas     : YES — input validated before use
 */

// ============================================================================
// TELEGRAM ROUTER — Deterministic message routing with InlineKeyboard support
// ============================================================================
// Route priority:
//   1. Callback data — wizard patterns (spec:*, doc:*, time:*, cfm:*) → FSM dispatch
//   2. Callback data — system patterns (cnf:, cxl:, res:, act:, dea:) → legacy
//   3. Slash commands (/start, /admin, /provider) → direct
//   4. Menu text (Agendar cita, 1, 2...) → direct (only if no active wizard)
//   5. Fallback → AI Agent
// ============================================================================

import {
  type BookingState,
  type DraftBooking,
  emptyDraft,
  BookingStateSchema,
  buildMainMenuKeyboard,
} from '../booking_fsm/index';
import { handleBookingWizard } from './booking-wizard';
import {
  InputSchema,
  type RouterOutput,
  type RouterInput,
  type InlineButton
} from './types';
import {
  isWizardCallback,
  buildRouteResult,
  matchCallback,
  matchCommand,
  matchMenu,
  COMMAND_RESPONSES
} from './services';

// ============================================================================
// Main entry point
// ============================================================================

export async function main(rawInput: unknown): Promise<RouterOutput> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { data: null, error: `Invalid input: ${parsed.error.message}` };
  }

  const input: RouterInput = parsed.data;
  const { text, chat_id, callback_data, booking_state, booking_draft, message_id } = input;

  // Parse booking state from raw input
  let parsedState: BookingState | null = null;
  if (booking_state !== null && booking_state !== undefined) {
    const parseResult = BookingStateSchema.safeParse(booking_state);
    if (parseResult.success) parsedState = parseResult.data;
  }
  const parsedDraft: DraftBooking | null = (booking_draft !== null && booking_draft !== undefined && typeof booking_draft === 'object')
    ? booking_draft as DraftBooking
    : null;

  // Priority 1: Callback data — wizard patterns
  if (callback_data !== null && isWizardCallback(callback_data) && parsedState !== null && parsedState.name !== 'idle') {
    const [wizardErr, wizardResult] = await handleBookingWizard({
      text: text ?? '',
      callbackData: callback_data,
      currentState: parsedState,
      draft: parsedDraft ?? emptyDraft(),
      chatId: chat_id,
      userName: input.username ?? 'Usuario',
    });

    // ALWAYS return a result with nextState (even if there's an error)
    // This ensures state persists to Redis via the flow
    const result = wizardResult ?? {
      route: 'wizard' as const,
      forward_to_ai: false,
      response_text: 'Error procesando comando. Intenta de nuevo.',
      inline_keyboard: [] as InlineButton[][],
      nextState: parsedState,
      nextDraft: parsedDraft ?? emptyDraft(),
      nextFlowStep: 0,
      advance: false,
      should_edit: true,
    };

    const shouldEdit = result.should_edit && message_id !== null;

    return { data: buildRouteResult('wizard', result.response_text, {
      inlineKeyboard: result.inline_keyboard as InlineButton[][],
      nextState: result.nextState,
      nextDraft: result.nextDraft,
      nextFlowStep: result.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    }), error: wizardErr?.message ?? null };
  }

  // Priority 1b: Text input when active booking state (text-based wizard fallback)
  if (callback_data === null && parsedState !== null && parsedState.name !== 'idle' && text !== null) {
    const [wizardErr, wizardResult] = await handleBookingWizard({
      text,
      callbackData: null,
      currentState: parsedState,
      draft: parsedDraft ?? emptyDraft(),
      chatId: chat_id,
      userName: input.username ?? 'Usuario',
    });

    // ALWAYS return a result with nextState (even if there's an error)
    const result = wizardResult ?? {
      route: 'wizard' as const,
      forward_to_ai: false,
      response_text: 'Error procesando comando. Intenta de nuevo.',
      inline_keyboard: [] as InlineButton[][],
      nextState: parsedState,
      nextDraft: parsedDraft ?? emptyDraft(),
      nextFlowStep: 0,
      advance: false,
      should_edit: true,
    };

    const shouldEdit = result.should_edit && message_id !== null;

    return { data: buildRouteResult('wizard', result.response_text, {
      inlineKeyboard: result.inline_keyboard as InlineButton[][],
      nextState: result.nextState,
      nextDraft: result.nextDraft,
      nextFlowStep: result.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    }), error: wizardErr?.message ?? null };
  }

  // Priority 2: Callback data — system patterns (cnf:, cxl:, etc.)
  const callbackMatch = matchCallback(callback_data);
  if (callbackMatch !== null) return { data: callbackMatch, error: null };

  // Priority 3: Slash commands
  const commandMatch = matchCommand(text);
  if (commandMatch !== null) return { data: commandMatch, error: null };

  // Priority 4: Menu & submenu (only if not in active wizard)
  // "1" or "agendar cita" when idle → start wizard with specialties
  if (parsedState === null || parsedState.name === 'idle') {
    const lowerText = text?.trim().toLowerCase();
    if (lowerText === '1' || lowerText === 'agendar cita') {
      // Start wizard — fetch specialties and return inline keyboard
      const [wizardErr, wizardResult] = await handleBookingWizard({
        text: '1',
        callbackData: null,
        currentState: null, // Start from idle
        draft: emptyDraft(),
        chatId: chat_id,
        userName: input.username ?? 'Usuario',
      });
      // ALWAYS return result with nextState, even if error
      const result = wizardResult ?? {
        route: 'wizard' as const,
        forward_to_ai: false,
        response_text: 'Error iniciando asistente. Intenta de nuevo.',
        inline_keyboard: [] as InlineButton[][],
        nextState: { name: 'idle' } as const,
        nextDraft: emptyDraft(),
        nextFlowStep: 0,
        advance: false,
        should_edit: false,
      };
      return { data: buildRouteResult('wizard', result.response_text, {
        inlineKeyboard: result.inline_keyboard as InlineButton[][],
        nextState: result.nextState,
        nextDraft: result.nextDraft,
        nextFlowStep: result.nextFlowStep,
        shouldEdit: false,
      }), error: wizardErr?.message ?? null };
    }
    // Handle "menu:back" callback → return to main menu
    if (callback_data === 'menu:back') {
      return { data: buildRouteResult('command', COMMAND_RESPONSES['welcome'] ?? 'Comando procesado.', {
        inlineKeyboard: buildMainMenuKeyboard(),
        menuAction: 'welcome',
      }), error: null };
    }
    const menuMatch = matchMenu(text);
    if (menuMatch !== null) return { data: menuMatch, error: null };
  }

  // Fallback: forward to AI Agent
  return { data: buildRouteResult('ai_agent', '', { forwardToAi: true }), error: null };
}
