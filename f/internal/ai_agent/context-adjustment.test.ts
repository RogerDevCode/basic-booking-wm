import { describe, test, expect } from 'vitest';

// Test the adjustIntentWithContext logic indirectly via main()
// We'll test the state management module directly

describe('Conversation State — Redis Get/Update', () => {
  test('createConversationRedis returns null without REDIS_URL', async () => {
    const { createConversationRedis } = await import('../conversation-state');
    const originalUrl = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];

    const redis = createConversationRedis();
    expect(redis).toBeNull();

    if (originalUrl !== undefined) process.env['REDIS_URL'] = originalUrl;
  });

  test('getConversationState returns null for non-existent chat', async () => {
    const { createConversationRedis, getConversationState } = await import('../conversation-state');
    const originalUrl = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];

    const redis = createConversationRedis();
    if (redis === null) {
      // Graceful degradation — no Redis, returns null
      const [err, state] = await getConversationState(null as any, 'nonexistent');
      expect(err).toBeNull();
      expect(state).toBeNull();
    }

    if (originalUrl !== undefined) process.env['REDIS_URL'] = originalUrl;
  });
});

describe('Context-Aware Intent Adjustment', () => {
  // These tests verify the adjustIntentWithContext function behavior
  // by testing through the main() function with conversation_state input

  test('number input in selecting_specialty flow → crear_cita', async () => {
    const { main } = await import('./main');
    const result = await main({
      chat_id: 'test-ctx-1',
      text: '1',
      conversation_state: {
        previous_intent: 'ver_disponibilidad',
        active_flow: 'selecting_specialty',
        flow_step: 1,
        pending_data: {},
        last_user_utterance: 'Especialidades: 1. Cardiología',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('crear_cita');
    expect(result.data?.confidence).toBeGreaterThanOrEqual(0.90);
  });

  test('number input in booking_wizard flow → crear_cita (specialty selection)', async () => {
    const { main } = await import('./main');
    const result = await main({
      chat_id: 'test-ctx-specialty',
      text: '1',
      conversation_state: {
        previous_intent: 'crear_cita',
        active_flow: 'booking_wizard',
        flow_step: 1,
        pending_data: {},
        last_user_utterance: 'Especialidades: 1. Cardiología',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('crear_cita');
    expect(result.data?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('number input with no state → stays original intent', async () => {
    const { main } = await import('./main');
    const result = await main({
      chat_id: 'test-ctx-2',
      text: '1',
      // No conversation_state
    });

    expect(result.success).toBe(true);
    // Without context, "1" should NOT be crear_cita
    expect(result.data?.intent).not.toBe('crear_cita');
  });

  test('"volver" in active flow → pregunta_general', async () => {
    const { main } = await import('./main');
    const result = await main({
      chat_id: 'test-ctx-3',
      text: 'volver',
      conversation_state: {
        previous_intent: 'crear_cita',
        active_flow: 'booking_wizard',
        flow_step: 2,
        pending_data: {},
        last_user_utterance: '¿Qué fecha prefieres?',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('pregunta_general');
  });

  test('"sí" in booking_wizard flow → crear_cita with high confidence', async () => {
    const { main } = await import('./main');
    const result = await main({
      chat_id: 'test-ctx-4',
      text: 'sí',
      conversation_state: {
        previous_intent: 'crear_cita',
        active_flow: 'booking_wizard',
        flow_step: 3,
        pending_data: { specialty: 'cardiologia', date: '2026-04-15' },
        last_user_utterance: 'Confirmar cita?',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('crear_cita');
    expect(result.data?.confidence).toBeGreaterThanOrEqual(0.90);
  });
});
