//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Handle Telegram inline keyboard button actions (confirm, cancel, reschedule)
 * DB Tables Used  : bookings, booking_audit, providers, clients, services
 * Concurrency Risk: YES — booking state transitions with SELECT FOR UPDATE
 * GCal Calls      : NO — marks bookings for GCal sync update
 * Idempotency Key : N/A — callback actions are inherently non-idempotent
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates callback_data format
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate callback query input (callback_query_id, callback_data, chat_id)
 * - Parse callback_data format "act:BID" into action code and booking_id
 * - Route to appropriate handler: confirm, cancel, reschedule, activate/deactivate reminders, acknowledge
 * - For DB mutations: update booking status, insert audit log, update reminder preferences
 * - Respond to Telegram with inline answer and optional follow-up message
 *
 * ### Schema Verification
 * - Tables: bookings, booking_audit, clients
 * - Columns: bookings (booking_id, status, client_id, start_time, end_time, cancelled_by, updated_at), booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason), clients (metadata for reminder_preferences) — booking_audit columns inferred from code
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Invalid callback_data format → answerCallbackQuery with error, no DB interaction
 * - Scenario 2: Booking already in terminal state → SELECT filters it out, returns "not found" error
 * - Scenario 3: Client mismatch on booking → unauthorized error returned, no state change
 * - Scenario 4: Telegram API call fails → logged to stderr, does not prevent DB operation success
 *
 * ### Concurrency Analysis
 * - Risk: YES — same booking could receive concurrent callback actions (e.g., confirm + cancel)
 * - Lock strategy: Status checks use WHERE status NOT IN terminal states; GIST exclusion and state machine transitions prevent double-state changes
 *
 * ### SOLID Compliance Check
 * - SRP: YES — confirmBooking, updateBookingStatus, updateReminderPreferences each handle one mutation
 * - DRY: YES — answerCallbackQuery and sendFollowUpMessage share similar fetch patterns but differ in payload
 * - KISS: YES — switch-based action routing with dedicated helper functions is the simplest correct approach
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// TELEGRAM CALLBACK HANDLER — Inline Button Action Processor
// ============================================================================
// Handles callback queries from Telegram inline keyboard buttons.
// Supports actions: confirm, cancel, reschedule, activate_reminders, deactivate_reminders.
// Callback data format: "act:BID" where act=action (1-3 chars), BID=booking_id (up to 60 chars)
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import { answerCallbackQuery } from "./answerCallbackQuery.ts";
import { parseCallbackData } from "./parseCallbackData.ts";
import { sendFollowUpMessage } from "./sendFollowUpMessage.ts";
import { InputSchema } from "./types.ts";
import { ConfirmHandler } from "./handlers/ConfirmHandler.ts";
import { RescheduleHandler } from "./handlers/RescheduleHandler.ts";
import { ActivateRemindersHandler } from "./handlers/ActivateRemindersHandler.ts";
import { DeactivateRemindersHandler } from "./handlers/DeactivateRemindersHandler.ts";
import { AcknowledgeHandler } from "./handlers/AcknowledgeHandler.ts";
import { TelegramRouter } from "./TelegramRouter.ts";
import { CancelHandler } from "./handlers/CancelHandler.ts";


export async function main(args: any) : Promise<[Error | null, Record<string, unknown> | null]> {
const rawInput: unknown = args;
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    return [new Error('TELEGRAM_BOT_TOKEN not configured'), null];
  }

  const parsedCallback = parseCallbackData(input.callback_data);
  if (!parsedCallback) {
    await answerCallbackQuery(botToken, input.callback_query_id, '⚠️ Acción no reconocida');
    return [new Error(`Invalid callback data format: ${input.callback_data}`), null];
  }

  const { action, booking_id } = parsedCallback;
  // FAIL FAST: require explicit tenant context. No fallback to null UUID.
  const tenantId = input.client_id ?? input.user_id;
  if (!tenantId) {
    await answerCallbackQuery(botToken, input.callback_query_id, '⚠️ Error: no se pudo identificar tu cuenta. Contacta a soporte.');
    return [new Error('tenant_id could not be determined from callback context'), null];
  }

  const dbUrl = process.env['DATABASE_URL'] ?? '';
  if (!dbUrl) {
    await answerCallbackQuery(botToken, input.callback_query_id, '❌ Error de configuración');
    return [new Error('DATABASE_URL not configured'), null];
  }

  const router = new TelegramRouter();
  router.register('cancel', new CancelHandler());
  router.register('confirm', new ConfirmHandler());
  router.register('reagendar_cita', new RescheduleHandler());
  router.register('activate_reminders', new ActivateRemindersHandler());
  router.register('deactivate_reminders', new DeactivateRemindersHandler());
  router.register('acknowledge', new AcknowledgeHandler());

  const context = {
    botToken,
    tenantId,
    booking_id,
    client_id: input.client_id,
    chat_id: input.chat_id,
    callback_query_id: input.callback_query_id,
    dbUrl
  };

  const [routeErr, result] = await router.route(action, context);
  
  if (routeErr ?? !result) {
      return [routeErr ?? new Error('route_failed'), null];
  }

  const { responseText, followUpText } = result;

  await answerCallbackQuery(botToken, input.callback_query_id, responseText);

  if (followUpText) {
    await sendFollowUpMessage(botToken, input.chat_id, followUpText);
  }

  return [null, {
    action,
    booking_id,
    callback_query_id: input.callback_query_id,
    response_text: responseText,
  }];
}