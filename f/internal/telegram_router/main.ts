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
} from '../booking_fsm';
import { handleBookingWizard } from './booking-wizard';
import {
  InputSchema,
  type Result,
  type RouteResult,
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

export async function main(rawInput: unknown): Promise<Result<RouteResult>> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
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

    if (wizardErr !== null || wizardResult === null) {
      return [wizardErr ?? new Error('Wizard returned null'), null];
    }

    // If this was a callback_query, we should_edit; otherwise sendMessage
    const shouldEdit = wizardResult.should_edit && message_id !== null;

    return [null, buildRouteResult('wizard', wizardResult.response_text, {
      inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
      nextState: wizardResult.nextState,
      nextDraft: wizardResult.nextDraft,
      nextFlowStep: wizardResult.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    })];
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

    if (wizardErr !== null || wizardResult === null) {
      return [wizardErr ?? new Error('Wizard returned null'), null];
    }

    const shouldEdit = wizardResult.should_edit && message_id !== null;

    return [null, buildRouteResult('wizard', wizardResult.response_text, {
      inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
      nextState: wizardResult.nextState,
      nextDraft: wizardResult.nextDraft,
      nextFlowStep: wizardResult.nextFlowStep,
      shouldEdit,
      messageId: message_id,
    })];
  }

  // Priority 2: Callback data — system patterns (cnf:, cxl:, etc.)
  const callbackMatch = matchCallback(callback_data);
  if (callbackMatch !== null) return [null, callbackMatch];

  // Priority 3: Slash commands
  const commandMatch = matchCommand(text);
  if (commandMatch !== null) return [null, commandMatch];

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
      if (wizardErr === null && wizardResult !== null) {
        return [null, buildRouteResult('wizard', wizardResult.response_text, {
          inlineKeyboard: wizardResult.inline_keyboard as InlineButton[][],
          nextState: wizardResult.nextState,
          nextDraft: wizardResult.nextDraft,
          nextFlowStep: wizardResult.nextFlowStep,
          shouldEdit: false,
        })];
      }
    }
    // Handle "menu:back" callback → return to main menu
    if (callback_data === 'menu:back') {
      return [null, buildRouteResult('command', COMMAND_RESPONSES['welcome'] ?? 'Comando procesado.', {
        inlineKeyboard: buildMainMenuKeyboard(),
        menuAction: 'welcome',
      })];
    }
    const menuMatch = matchMenu(text);
    if (menuMatch !== null) return [null, menuMatch];
  }

  // Fallback: forward to AI Agent
  return [null, buildRouteResult('ai_agent', '', { forwardToAi: true })];
}
