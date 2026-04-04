/**
 * DEVIL'S ADVOCATE — Real-World Edge Case Tests (50 tests)
 *
 * Purpose: Find logical flaws in the booking system by testing
 * realistic but tricky user scenarios that the AI Agent must handle.
 *
 * Categories: Time/Date edge cases, multi-intent confusion,
 *             context switching, partial information, cultural nuances,
 *             booking lifecycle, error recovery, state transitions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { main } from './main';
import { INTENT } from './constants';

interface DevilTest {
  readonly id: number;
  readonly category: string;
  readonly input: string;
  readonly expectedIntent?: string;
  readonly expectedEntity?: string;
  readonly shouldSucceed: boolean;
}

const TESTS: readonly DevilTest[] = [
  // ─── Time/Date Edge Cases (1-10) ───────────────────────────
  { id: 1, category: 'time_edge', input: 'Quiero cita para el 31 de febrero', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 2, category: 'time_edge', input: 'Necesito hora para las 25:00', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 3, category: 'time_edge', input: 'Agenda para pasado mañana a medianoche', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 4, category: 'time_edge', input: 'Quiero cita para ayer', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 5, category: 'time_edge', input: 'Necesito hora para el año que viene', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 6, category: 'time_edge', input: 'Tienes disponibilidad para el 29 de febrero?', expectedIntent: INTENT.CHECK_AVAILABILITY, shouldSucceed: true },
  { id: 7, category: 'time_edge', input: 'Puedo agendar para las 00:00 del lunes?', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 8, category: 'time_edge', input: 'Quiero cita en 5 minutos', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 9, category: 'time_edge', input: 'Necesito hora para dentro de 3 meses', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 10, category: 'time_edge', input: 'Agenda para el próximo bisiesto', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },

  // ─── Multi-Intent Confusion (11-15) ────────────────────────
  { id: 11, category: 'multi_intent', input: 'Hola, quiero agendar pero también cancelar mi cita anterior', expectedIntent: INTENT.GREETING, shouldSucceed: true },
  { id: 12, category: 'multi_intent', input: 'Buenos días, necesito reprogramar y también saber si tienen disponibilidad', expectedIntent: INTENT.GREETING, shouldSucceed: true },
  { id: 13, category: 'multi_intent', input: 'Quiero cancelar y agendar otra cita para mañana', expectedIntent: INTENT.CANCEL_APPOINTMENT, shouldSucceed: true },
  { id: 14, category: 'multi_intent', input: 'Urgente! Necesito cancelar mi cita y agendar una nueva para hoy', expectedIntent: INTENT.URGENT_CARE, shouldSucceed: true },
  { id: 15, category: 'multi_intent', input: 'Hola gracias por todo, quiero saber mis citas y cancelar la del viernes', expectedIntent: INTENT.GREETING, shouldSucceed: true },

  // ─── Context Switching (16-20) ─────────────────────────────
  { id: 16, category: 'context_switch', input: 'No, mejor para el jueves', expectedIntent: INTENT.RESCHEDULE, shouldSucceed: true },
  { id: 17, category: 'context_switch', input: 'Cambié de opinión, cancela todo', expectedIntent: INTENT.CANCEL_APPOINTMENT, shouldSucceed: true },
  { id: 18, category: 'context_switch', input: 'Mejor no quiero, gracias', expectedIntent: INTENT.FAREWELL, shouldSucceed: true },
  { id: 19, category: 'context_switch', input: 'Espera, déjame pensarlo', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 20, category: 'context_switch', input: 'Olvida lo que dije, quiero agendar para otro día', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },

  // ─── Partial Information (21-25) ───────────────────────────
  { id: 21, category: 'partial_info', input: 'Quiero una cita', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 22, category: 'partial_info', input: 'Necesito hora', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 23, category: 'partial_info', input: 'Agenda', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 24, category: 'partial_info', input: 'Cancelar', expectedIntent: INTENT.CANCEL_APPOINTMENT, shouldSucceed: true },
  { id: 25, category: 'partial_info', input: 'Reprogramar', expectedIntent: INTENT.RESCHEDULE, shouldSucceed: true },

  // ─── Cultural/Linguistic Nuances (26-30) ───────────────────
  { id: 26, category: 'cultural', input: 'Quiero sacarme la muela', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 27, category: 'cultural', input: 'Necesito que me vean por un dolor de guata', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 28, category: 'cultural', input: 'Quiero la hora con el doctor', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 29, category: 'cultural', input: 'Necesito un chequeo general', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 30, category: 'cultural', input: 'Quiero que me den la hora', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },

  // ─── Booking Lifecycle (31-35) ─────────────────────────────
  { id: 31, category: 'lifecycle', input: 'Confirmame la cita que agendé ayer', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 32, category: 'lifecycle', input: 'Ya no voy a poder ir a mi cita', expectedIntent: INTENT.CANCEL_APPOINTMENT, shouldSucceed: true },
  { id: 33, category: 'lifecycle', input: 'Mi cita fue reprogramada automáticamente?', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 34, category: 'lifecycle', input: 'No fui a mi cita de ayer, qué pasa?', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 35, category: 'lifecycle', input: 'Ya completé mi cita, necesito el certificado', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },

  // ─── Error Recovery Scenarios (36-40) ──────────────────────
  { id: 36, category: 'error_recovery', input: 'Me dio error al agendar, inténtalo de nuevo', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 37, category: 'error_recovery', input: 'Se me cayó la conexión, estaba agendando', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 38, category: 'error_recovery', input: 'No me llegó la confirmación por email', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 39, category: 'error_recovery', input: 'El sistema no me deja cancelar', expectedIntent: INTENT.CANCEL_APPOINTMENT, shouldSucceed: true },
  { id: 40, category: 'error_recovery', input: 'Me cobraron doble por la cita', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },

  // ─── State Transitions (41-45) ─────────────────────────────
  { id: 41, category: 'state_transition', input: 'Mi cita está pendiente, confírmala', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 42, category: 'state_transition', input: 'Quiero pasar mi cita de confirmada a reprogramada', expectedIntent: INTENT.RESCHEDULE, shouldSucceed: true },
  { id: 43, category: 'state_transition', input: 'Mi cita ya fue, pero no me marcaron como atendido', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 44, category: 'state_transition', input: 'Cancelé mi cita pero quiero volver a agendarla', expectedIntent: INTENT.CREATE_APPOINTMENT, shouldSucceed: true },
  { id: 45, category: 'state_transition', input: 'Reprogramé pero me equivoqué de hora', expectedIntent: INTENT.RESCHEDULE, shouldSucceed: true },

  // ─── Realistic Complex Queries (46-50) ─────────────────────
  { id: 46, category: 'complex_query', input: 'Hola, soy María, necesito una cita con el Dr. López para el martes a las 3 de la tarde, es para un control de diabetes', expectedIntent: INTENT.GREETING, shouldSucceed: true },
  { id: 47, category: 'complex_query', input: 'Buenas tardes, quiero cancelar la cita que tengo agendada para mañana porque tengo una emergencia familiar y necesito reprogramarla para la próxima semana si es posible', expectedIntent: INTENT.GREETING, shouldSucceed: true },
  { id: 48, category: 'complex_query', input: 'Oye, me puedes decir si el doctor Martínez atiende los sábados por la mañana y si tiene disponibilidad para una consulta de dermatología?', expectedIntent: INTENT.CHECK_AVAILABILITY, shouldSucceed: true },
  { id: 49, category: 'complex_query', input: 'Mira, agendé una cita hace una semana pero no me llegó ningún recordatorio, quiero saber si está confirmada y si me pueden reenviar los datos', expectedIntent: INTENT.GENERAL_QUESTION, shouldSucceed: true },
  { id: 50, category: 'complex_query', input: 'Necesito urgente una hora porque tengo un dolor muy fuerte en el pecho y no puedo esperar hasta la próxima semana, por favor ayúdeme', expectedIntent: INTENT.URGENT_CARE, shouldSucceed: true },
];

describe("DEVIL'S ADVOCATE — Real-World Edge Case Tests (50 tests)", () => {
  beforeAll(() => {
    if (!process.env['GROQ_API_KEY'] && !process.env['OPENAI_API_KEY']) {
      console.warn('⚠️  No LLM API key set — tests use fallback rules');
    }
  });

  for (const t of TESTS) {
    it(`[${t.category}] #${t.id}: ${t.input.slice(0, 60)}${t.input.length > 60 ? '...' : ''}`, async () => {
      const result = await main({
        chat_id: 'devil-test',
        text: t.input,
      });

      // Core invariant: must return valid structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error_message');

      // If expected intent, validate
      if (t.expectedIntent != null && result.success && result.data) {
        const d = result.data as Record<string, unknown>;
        expect(d['intent']).toBe(t.expectedIntent);
      }

      // Confidence must be valid range
      if (result.success && result.data) {
        const d = result.data as Record<string, unknown>;
        const conf = d['confidence'] as number;
        expect(typeof conf).toBe('number');
        expect(conf).toBeGreaterThanOrEqual(0);
        expect(conf).toBeLessThanOrEqual(1);
      }
    });
  }
});
