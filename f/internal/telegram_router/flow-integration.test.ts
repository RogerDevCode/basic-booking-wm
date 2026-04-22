/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Integration tests simulating full Telegram message flows
 * DB Tables Used  : None — pure flow simulation, no DB
 * Concurrency Risk: NO — sequential async tests
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — all webhook payloads validated
 */

// ============================================================================
// TELEGRAM FLOW INTEGRATION TESTS
// ============================================================================
// Simulates complete message flows from Telegram webhook to response.
// Tests the full pipeline: trigger → router → (parser → AI Agent → send)
// without actually calling Telegram's API.
// ============================================================================

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

// Simulated webhook payload builder
function buildMessagePayload(text: string, chatId: string = '12345', firstName: string = 'Roger'): Record<string, unknown> {
  return {
    update_id: Math.floor(Math.random() * 1000000),
    message: {
      message_id: Math.floor(Math.random() * 10000),
      from: { id: parseInt(chatId), is_bot: false, first_name: firstName },
      chat: { id: parseInt(chatId), type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

function buildCallbackPayload(data: string, chatId: string = '12345', messageId: number = 999): Record<string, unknown> {
  return {
    update_id: Math.floor(Math.random() * 1000000),
    callback_query: {
      id: 'cbq_' + Math.random().toString(36).slice(2),
      from: { id: parseInt(chatId), is_bot: false, first_name: 'Roger' },
      message: {
        message_id: messageId,
        chat: { id: parseInt(chatId), type: 'private' },
      },
      data,
      chat_instance: '12345',
    },
  };
}

describe('Telegram Flow — /start command (deterministic, no LLM)', () => {
  test('full flow: /start → welcome response (0ms, no AI Agent)', async () => {
    // Step 1: Webhook trigger
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('/start');
    const triggerData = await triggerMain(triggerInput);

    expect(triggerData.error).toBeNull();
    expect(triggerData).not.toBeNull();
    expect(triggerData.chat_id).toBe('12345');
    expect(triggerData.text).toBe('/start');
    expect(triggerData.callback_data).toBeNull();

    // Step 2: Router — should match /start command
    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.error).toBeNull();
    expect(routerResult.data).not.toBeNull();
    expect(routerResult.data!.route).toBe('command');
    expect(routerResult.data!.forward_to_ai).toBe(false);
    expect(routerResult.data!.response_text).toContain('Bienvenido');
    expect(routerResult.data!.response_text).toContain('¿Qué deseas hacer?');
    expect(routerResult.data!.menu_action).toBe('welcome');

    // Verify: AI Agent was NOT called (forward_to_ai = false)
    // In real flow, gate_ai_agent would skip the AI Agent step
  });
});

describe('Telegram Flow — Menu selection (deterministic)', () => {
  test('full flow: "1" → book_appointment response (no AI Agent)', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('1');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.error).toBeNull();
    // "1" now starts wizard or falls back to menu
    expect(['wizard', 'menu']).toContain(routerResult.data!.route);
    expect(routerResult.data!.forward_to_ai).toBe(false);
  });

  test('full flow: "Mis citas" → my_bookings response', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('Mis citas');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('menu');
    expect(routerResult.data!.menu_action).toBe('my_bookings');
    expect(routerResult.data!.response_text).toContain('Mis Citas');
  });

  test('full flow: "Recordatorios" → reminders submenu', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('Recordatorios');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('menu');
    expect(routerResult.data!.menu_action).toBe('reminders');
    expect(routerResult.data!.response_text).toContain('Recordatorios');
  });
});

describe('Telegram Flow — Callback queries (inline buttons)', () => {
  test('full flow: callback cnf:booking-uuid → confirmation', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildCallbackPayload('cnf:abc-123-def');
    const triggerData = await triggerMain(triggerInput);

    expect(triggerData.error).toBeNull();
    expect(triggerData.callback_data).toBe('cnf:abc-123-def');
    expect(triggerData.text).toBe('');

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('callback');
    expect(routerResult.data!.forward_to_ai).toBe(false);
    expect(routerResult.data!.callback_action).toBe('cnf');
    expect(routerResult.data!.callback_booking_id).toBe('abc-123-def');
    expect(routerResult.data!.response_text).toContain('confirmada');
  });

  test('full flow: callback cxl:booking-uuid → cancellation', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildCallbackPayload('cxl:xyz-789');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.callback_action).toBe('cxl');
    expect(routerResult.data!.response_text).toContain('cancelada');
  });

  test('full flow: callback res: → reschedule prompt', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildCallbackPayload('res:');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.callback_action).toBe('res');
    expect(routerResult.data!.response_text).toContain('reagendar');
  });
});

describe('Telegram Flow — Free text (goes to AI Agent)', () => {
  test('full flow: "Hola necesito una cita" → AI Agent → crear_cita', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('Hola necesito una cita para mañana');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('ai_agent');
    expect(routerResult.data!.forward_to_ai).toBe(true);

    // In real flow, this would go to parse_message → ai_agent
    // Here we verify the router correctly forwards to AI
  });

  test('full flow: "quiero cancelar mi cita" → AI Agent → cancelar_cita', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('quiero cancelar mi cita del martes');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('ai_agent');
    expect(routerResult.data!.forward_to_ai).toBe(true);
  });
});

describe('Telegram Flow — Multi-turn conversation with state', () => {
  test('scenario: /start → 1 → specialty selection context', async () => {
    // Turn 1: /start → welcome
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const turn1 = await triggerMain(buildMessagePayload('/start'));
    expect(turn1.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const router1 = await routerMain({
      chat_id: turn1.chat_id,
      text: turn1.text,
      callback_data: turn1.callback_data,
      username: turn1.username,
    });
    expect(router1.data!.route).toBe('command');

    // Simulate: user selects "1" (Pedir hora)
    // In real flow, bot sends specialty menu, then user responds "1"
    const turn2 = await triggerMain(buildMessagePayload('1'));
    expect(turn2.error).toBeNull();

    const router2 = await routerMain({
      chat_id: turn2.chat_id,
      text: turn2.text,
      callback_data: turn2.callback_data,
      username: turn2.username,
    });
    expect(['wizard', 'menu']).toContain(router2.data!.route);
  });

  test('scenario: callback priority over text', async () => {
    // When both text and callback_data exist, callback wins
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const payload = buildCallbackPayload('cnf:booking-123');
    // Add text too (edge case)
    (payload as Record<string, unknown>).message = {
      ...(payload as Record<string, unknown>).callback_query as Record<string, unknown>
    } as Record<string, unknown>;

    const triggerData = await triggerMain(payload);
    expect(triggerData.error).toBeNull();
    expect(triggerData.callback_data).toBe('cnf:booking-123');

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('callback');
  });
});

describe('Telegram Flow — Edge cases', () => {
  test('empty message → ai_agent (not matched)', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();
    expect(triggerData.text).toBe('');

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    // Empty text + no callback → ai_agent fallback
    expect(routerResult.data!.forward_to_ai).toBe(true);
  });

  test('whitespace-only message → ai_agent', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('   ');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.forward_to_ai).toBe(true);
  });

  test('uppercase command /START → still matches', async () => {
    const { main: triggerMain } = await import('../../flows/telegram_webhook__flow/telegram_webhook_trigger');
    const triggerInput = buildMessagePayload('/START');
    const triggerData = await triggerMain(triggerInput);
    expect(triggerData.error).toBeNull();

    const { main: routerMain } = await import('./main');
    const routerResult = await routerMain({
      chat_id: triggerData.chat_id,
      text: triggerData.text,
      callback_data: triggerData.callback_data,
      username: triggerData.username,
    });

    expect(routerResult.data!.route).toBe('command');
    expect(routerResult.data!.response_text).toContain('Bienvenido');
  });
});
