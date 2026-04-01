// ============================================================================
// RED TEAM TESTS — Intent Collision & Edge Cases (migrated from Go)
// Tests de colisión de intents, falsos positivos, y prioridad
// ============================================================================

import { describe, test, expect } from 'vitest';
import { main, AIAgentInput } from './main';
import { INTENT } from './constants';

describe('Red Team — Intent Collision Tests', () => {

  // BUG #1: Cancel vs Create collision
  // "Quiero cancelar mi cita" → debe ser cancel, NO create
  describe('Cancel vs Create Collision', () => {
    test('cancelar con "quiero" debe priorizar cancel', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero cancelar mi cita' };
      const result = await main(input);
      expect(result.success).toBe(true);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });

    test('cancelar simple', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'cancelar cita' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });

    test('anular reserva', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'necesito anular mi reserva' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });

    test('eliminar cita', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero eliminar la cita' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });
  });

  // BUG #2: Reschedule vs Create collision
  // "Necesito reprogramar para el viernes" → debe ser reschedule, NO create
  describe('Reschedule vs Create Collision', () => {
    test('reprogramar con "para" debe priorizar reschedule', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'necesito reprogramar para el viernes' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.RESCHEDULE);
    });

    test('cambiar cita', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero cambiar mi cita' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.RESCHEDULE);
    });

    test('mover reserva', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'necesito mover la reserva' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.RESCHEDULE);
    });

    test('trasladar cita', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero trasladar mi cita' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.RESCHEDULE);
    });
  });

  // Urgency priority over other intents
  describe('Urgency Priority', () => {
    test('urgente con cancelar → urgent_care', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'es urgente necesito cancelar' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.URGENT_CARE);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('emergencia con reprogramar → urgent_care', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'emergencia tengo que reprogramar' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.URGENT_CARE);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('urgente con hoy → urgent_care', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'urgente necesito hora para hoy' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.URGENT_CARE);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // Flexibility detection
  describe('Flexibility Detection', () => {
    test('cualquier día → check_availability + is_flexible', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'me sirve cualquier día' };
      const result = await main(input);
      expect(result.data?.context.is_flexible).toBe(true);
    });

    test('lo que tengas disponible → is_flexible', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'agendo lo que tengas disponible' };
      const result = await main(input);
      expect(result.data?.context.is_flexible).toBe(true);
    });

    test('lo que conviene → is_flexible', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'reservo lo que más conviene' };
      const result = await main(input);
      expect(result.data?.context.is_flexible).toBe(true);
    });

    test('indistinto → is_flexible', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'me es indistinto el día' };
      const result = await main(input);
      expect(result.data?.context.is_flexible).toBe(true);
    });

    test('flexible → is_flexible', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'soy flexible con los horarios' };
      const result = await main(input);
      expect(result.data?.context.is_flexible).toBe(true);
    });
  });

  // Keyword weighting: specific > generic
  describe('Keyword Weighting', () => {
    test('cancelar debe tener mayor peso que quiero', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero cancelar' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });

    test('reprogramar debe tener mayor peso que para', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'reprogramar para mañana' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.RESCHEDULE);
    });

    test('anular debe tener mayor peso que necesito', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'necesito anular' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CANCEL_APPOINTMENT);
    });
  });

  // Negative cases: no false positives
  describe('Negative Cases — No False Positives', () => {
    test('pregunta no debe ser booking', async () => {
      const input: AIAgentInput = { chat_id: '123', text: '¿Quiero saber si tienen disponibilidad?' };
      const result = await main(input);
      expect(result.data?.intent).not.toBe(INTENT.CREATE_APPOINTMENT);
    });

    test('saludo no debe ser booking', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'Hola, quiero saludar' };
      const result = await main(input);
      expect(result.data?.intent).not.toBe(INTENT.CREATE_APPOINTMENT);
    });

    test('gracias no debe ser booking', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'Gracias, quiero agradecer' };
      const result = await main(input);
      expect(result.data?.intent).not.toBe(INTENT.CREATE_APPOINTMENT);
    });
  });

  // Ambiguous phrases
  describe('Ambiguous Phrases', () => {
    test('cita sin verbo → create_appointment', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'Una cita para mañana' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CREATE_APPOINTMENT);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.3);
    });

    test('hora disponible → check_availability', async () => {
      const input: AIAgentInput = { chat_id: '123', text: '¿Hora disponible?' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CHECK_AVAILABILITY);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.3);
    });

    test('necesito un turno → create_appointment', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'Necesito un turno' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.CREATE_APPOINTMENT);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  // Context override: urgency overrides base intent
  describe('Context Override', () => {
    test('create con urgencia → urgent_care', async () => {
      const input: AIAgentInput = { chat_id: '123', text: 'quiero agendar urgente ya' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.URGENT_CARE);
    });

    test('check con urgencia → urgent_care', async () => {
      const input: AIAgentInput = { chat_id: '123', text: '¿tienen disponibilidad? emergencia dolor' };
      const result = await main(input);
      expect(result.data?.intent).toBe(INTENT.URGENT_CARE);
    });
  });
});
