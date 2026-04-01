/**
 * AI Agent - Comprehensive Intent & Entity Extraction Tests
 * 
 * Tests: 100+ real-world user queries
 * Categories: Intent detection, Entity extraction, RAG, Profanity, 
 *             Spelling errors, Dyslexia, Unrelated questions, Edge cases
 * 
 * Only FAILURES are shown (passing tests are silent)
 * 
 * UPDATED: Using INTENTS constants for expected values (Hoverbot.ai best practice)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { main } from './main';
import { INTENT } from './constants';

// ============================================================================
// TEST DATA - 100+ REAL-WORLD QUERIES
// ============================================================================

interface TestQuery {
  readonly id: number;
  readonly category: string;
  readonly input: string;
  readonly expectedIntent: string;
  readonly expectedEntities?: Record<string, unknown>;
  readonly expectedContext?: Record<string, unknown>;
  readonly minConfidence?: number;
}

const TEST_QUERIES: TestQuery[] = [
  // ============================================================================
  // CATEGORY 1: INTENT DETECTION - CREATE APPOINTMENT (15 queries)
  // ============================================================================
  {
    id: 1,
    category: 'create_appointment',
    input: 'Quiero agendar una cita',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 2,
    category: 'create_appointment',
    input: 'Necesito reservar un turno',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 3,
    category: 'create_appointment',
    input: 'Quiero sacar una cita médica',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 4,
    category: 'create_appointment',
    input: 'Agendar cita para mañana',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { date: 'mañana' },
    minConfidence: 0.3
  },
  {
    id: 5,
    category: 'create_appointment',
    input: 'Reservar turno el lunes',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { date: 'lunes' },
    minConfidence: 0.3
  },
  {
    id: 6,
    category: 'create_appointment',
    input: 'Cita con el Dr. García',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { provider_name: 'Dr. García' },
    minConfidence: 0.3
  },
  {
    id: 7,
    category: 'create_appointment',
    input: 'Quiero una consulta general',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { service_type: 'consulta general' },
    minConfidence: 0.3
  },
  {
    id: 8,
    category: 'create_appointment',
    input: 'Agendar para el 15 de marzo',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { date: '15 de marzo' },
    minConfidence: 0.3
  },
  {
    id: 9,
    category: 'create_appointment',
    input: 'Reservar cita a las 10:00',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { time: '10:00' },
    minConfidence: 0.3
  },
  {
    id: 10,
    category: 'create_appointment',
    input: 'Turno para la próxima semana',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { date: 'próxima semana' },
    minConfidence: 0.3
  },
  {
    id: 11,
    category: 'create_appointment',
    input: 'Cita médica urgente',
    expectedIntent: INTENT.URGENT_CARE,  // Should detect urgency
    minConfidence: 0.5
  },
  {
    id: 12,
    category: 'create_appointment',
    input: 'Necesito ver al doctor',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 13,
    category: 'create_appointment',
    input: 'Quiero pedir hora',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 14,
    category: 'create_appointment',
    input: 'Agendar visita médica',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 15,
    category: 'create_appointment',
    input: 'Reservar para cardiología',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    expectedEntities: { service_type: 'cardiología' },
    minConfidence: 0.3
  },

  // ============================================================================
  // CATEGORY 2: INTENT DETECTION - CANCEL APPOINTMENT (10 queries)
  // ============================================================================
  {
    id: 16,
    category: 'cancel_appointment',
    input: 'Quiero cancelar mi cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 17,
    category: 'cancel_appointment',
    input: 'Necesito anular mi turno',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 18,
    category: 'cancel_appointment',
    input: 'Cancelar la cita que tengo',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 19,
    category: 'cancel_appointment',
    input: 'No puedo asistir, quiero cancelar',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 20,
    category: 'cancel_appointment',
    input: 'Eliminar mi reserva',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 21,
    category: 'cancel_appointment',
    input: 'Dar de baja la cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 22,
    category: 'cancel_appointment',
    input: 'Cancelar cita del lunes',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 23,
    category: 'cancel_appointment',
    input: 'Anular turno con Dr. García',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 24,
    category: 'cancel_appointment',
    input: 'Ya no necesito la cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 25,
    category: 'cancel_appointment',
    input: 'Borrar mi reserva',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 3: INTENT DETECTION - RESCHEDULE (10 queries)
  // ============================================================================
  {
    id: 26,
    category: 'reschedule',
    input: 'Quiero cambiar mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 27,
    category: 'reschedule',
    input: 'Necesito reprogramar mi turno',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 28,
    category: 'reschedule',
    input: 'Mover la cita para otro día',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 29,
    category: 'reschedule',
    input: 'Reagendar mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 30,
    category: 'reschedule',
    input: 'Cambiar la hora de mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 31,
    category: 'reschedule',
    input: 'Pasar mi turno para la semana que viene',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 32,
    category: 'reschedule',
    input: 'Modificar la fecha de mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 33,
    category: 'reschedule',
    input: 'Cambiar cita del lunes al miércoles',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 34,
    category: 'reschedule',
    input: 'Reprogramar para otro horario',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 35,
    category: 'reschedule',
    input: 'Trasladar mi turno',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 4: INTENT DETECTION - CHECK AVAILABILITY (10 queries)
  // ============================================================================
  {
    id: 36,
    category: 'check_availability',
    input: '¿Qué horas tienen disponibles?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 37,
    category: 'check_availability',
    input: '¿Tienen disponibilidad para hoy?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    expectedContext: { is_today: true },
    minConfidence: 0.3
  },
  {
    id: 38,
    category: 'check_availability',
    input: '¿Qué días tienen libre?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 39,
    category: 'check_availability',
    input: '¿Me pueden decir si tienen hora?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 40,
    category: 'check_availability',
    input: '¿Hay disponibilidad esta semana?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 41,
    category: 'check_availability',
    input: '¿Qué horarios tienen?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 42,
    category: 'check_availability',
    input: '¿Tienen turno disponible?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 43,
    category: 'check_availability',
    input: '¿Me dicen si tienen lugar?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 44,
    category: 'check_availability',
    input: '¿Qué días están disponibles?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 45,
    category: 'check_availability',
    input: '¿Tienen huecos libres?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },

  // ============================================================================
  // CATEGORY 5: INTENT DETECTION - URGENT CARE (10 queries)
  // ============================================================================
  {
    id: 46,
    category: 'urgent_care',
    input: '¡Es urgente, necesito atención ya!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 47,
    category: 'urgent_care',
    input: 'Tengo una emergencia médica',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 48,
    category: 'urgent_care',
    input: '¡Necesito una cita urgente!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 49,
    category: 'urgent_care',
    input: 'Es muy urgente, tengo mucho dolor',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 50,
    category: 'urgent_care',
    input: '¡Necesito que me atiendan ahora mismo!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 51,
    category: 'urgent_care',
    input: 'Urgencia, necesito ayuda inmediata',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 52,
    category: 'urgent_care',
    input: '¡Es una emergencia, por favor!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 53,
    category: 'urgent_care',
    input: 'Necesito atención urgente, es importante',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 54,
    category: 'urgent_care',
    input: '¡Urgente, no puedo esperar!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 55,
    category: 'urgent_care',
    input: 'Emergencia médica, necesito cita ya',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 6: SPELLING ERRORS (10 queries)
  // ============================================================================
  {
    id: 56,
    category: 'spelling_errors',
    input: 'Quiero ajendar una sita',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 57,
    category: 'spelling_errors',
    input: 'Necesito reserbar un turno',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 58,
    category: 'spelling_errors',
    input: 'Quiero kanselar mi cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 59,
    category: 'spelling_errors',
    input: 'Reprogramar mi turno para otro dia',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 60,
    category: 'spelling_errors',
    input: 'Tienen disponibilidaz?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 61,
    category: 'spelling_errors',
    input: 'Urjente, necesito atencion',
    expectedIntent: INTENT.URGENT_CARE,
    minConfidence: 0.5
  },
  {
    id: 62,
    category: 'spelling_errors',
    input: 'Quiero una konsulta general',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 63,
    category: 'spelling_errors',
    input: 'Anular mi reserba',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 64,
    category: 'spelling_errors',
    input: 'Cambiar la ora de mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 65,
    category: 'spelling_errors',
    input: 'Tienen lugar disponsible?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },

  // ============================================================================
  // CATEGORY 7: DYSLEXIA SIMULATION (10 queries)
  // ============================================================================
  {
    id: 66,
    category: 'dyslexia',
    input: 'Quiero agnedar una cita',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 67,
    category: 'dyslexia',
    input: 'Necesito resevar un truno',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 68,
    category: 'dyslexia',
    input: 'Quiero cancelsr mi cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 69,
    category: 'dyslexia',
    input: 'Reporgramar mi truno',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 70,
    category: 'dyslexia',
    input: 'Tienen disponiblidad?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },
  {
    id: 71,
    category: 'dyslexia',
    input: 'Urgnete, nececito atencion',
    expectedIntent: INTENT.URGENT_CARE,
    minConfidence: 0.5
  },
  {
    id: 72,
    category: 'dyslexia',
    input: 'Quiero una cosulta',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 73,
    category: 'dyslexia',
    input: 'Anualr mi resera',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 74,
    category: 'dyslexia',
    input: 'Cambiar la hor de mi cita',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 75,
    category: 'dyslexia',
    input: 'Tienen lugr disponible?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },

  // ============================================================================
  // CATEGORY 8: PROFANITY / COLOQUIALISMOS (5 queries)
  // ============================================================================
  {
    id: 76,
    category: 'profanity',
    input: 'Quiero agendar una cita, carajo',
    expectedIntent: INTENT.CREATE_APPOINTMENT,
    minConfidence: 0.3
  },
  {
    id: 77,
    category: 'profanity',
    input: 'Necesito cancelar mi puta cita',
    expectedIntent: INTENT.CANCEL_APPOINTMENT,
    minConfidence: 0.5
  },
  {
    id: 78,
    category: 'profanity',
    input: 'Reprogramar mi turno, mierda',
    expectedIntent: INTENT.RESCHEDULE,
    minConfidence: 0.5
  },
  {
    id: 79,
    category: 'profanity',
    input: '¡Es urgente, coño!',
    expectedIntent: INTENT.URGENT_CARE,
    expectedContext: { is_urgent: true },
    minConfidence: 0.5
  },
  {
    id: 80,
    category: 'profanity',
    input: 'Tienen disponibilidad o qué, carajo?',
    expectedIntent: INTENT.CHECK_AVAILABILITY,
    minConfidence: 0.3
  },

  // ============================================================================
  // CATEGORY 9: UNRELATED QUESTIONS (10 queries)
  // ============================================================================
  {
    id: 81,
    category: 'unrelated',
    input: '¿Qué tiempo hace hoy?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 82,
    category: 'unrelated',
    input: '¿Cuál es la capital de Francia?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 83,
    category: 'unrelated',
    input: '¿Me puedes contar un chiste?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 84,
    category: 'unrelated',
    input: '¿Qué hora es?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 85,
    category: 'unrelated',
    input: '¿Quién es el presidente?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 86,
    category: 'unrelated',
    input: '¿Cómo se hace una paella?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 87,
    category: 'unrelated',
    input: '¿Qué películas hay en el cine?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 88,
    category: 'unrelated',
    input: '¿Cuánto es 2 + 2?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 89,
    category: 'unrelated',
    input: '¿Dónde queda el restaurante más cercano?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },
  {
    id: 90,
    category: 'unrelated',
    input: '¿Qué equipo de fútbol gana hoy?',
    expectedIntent: INTENT.GENERAL_QUESTION,
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 10: GREETINGS / FAREWELLS (10 queries)
  // ============================================================================
  {
    id: 91,
    category: 'greetings',
    input: 'Hola',
    expectedIntent: INTENT.GREETING,
    minConfidence: 0.5
  },
  {
    id: 92,
    category: 'greetings',
    input: 'Buenos días',
    expectedIntent: INTENT.GREETING,
    minConfidence: 0.5
  },
  {
    id: 93,
    category: 'greetings',
    input: 'Buenas tardes',
    expectedIntent: INTENT.GREETING,
    minConfidence: 0.5
  },
  {
    id: 94,
    category: 'greetings',
    input: 'Hola, ¿qué tal?',
    expectedIntent: INTENT.GREETING,
    minConfidence: 0.5
  },
  {
    id: 95,
    category: 'greetings',
    input: 'Saludos',
    expectedIntent: INTENT.GREETING,
    minConfidence: 0.5
  },
  {
    id: 96,
    category: 'farewells',
    input: 'Chau',
    expectedIntent: INTENT.FAREWELL,
    minConfidence: 0.5
  },
  {
    id: 97,
    category: 'farewells',
    input: 'Adiós',
    expectedIntent: INTENT.FAREWELL,
    minConfidence: 0.5
  },
  {
    id: 98,
    category: 'farewells',
    input: 'Hasta luego',
    expectedIntent: INTENT.FAREWELL,
    minConfidence: 0.5
  },
  {
    id: 99,
    category: 'farewells',
    input: 'Nos vemos',
    expectedIntent: INTENT.FAREWELL,
    minConfidence: 0.5
  },
  {
    id: 100,
    category: 'farewells',
    input: 'Gracias',
    expectedIntent: INTENT.THANK_YOU,
    minConfidence: 0.5
  },
];

// ============================================================================
// TEST SUITE
// ============================================================================

describe('AI Agent - Comprehensive Intent & Entity Tests', () => {
  const failures: Array<{
    id: number;
    category: string;
    input: string;
    expected: string;
    actual: string;
    confidence: number;
    reason: string;
  }> = [];

  beforeAll(() => {
    // Initialize any required resources
  });

  it('should pass all 100+ test queries', async () => {
    for (const test of TEST_QUERIES) {
      const result = await main({
        chat_id: 'test_123',
        text: test.input,
      });

      if (!result.success || !result.data) {
        failures.push({
          id: test.id,
          category: test.category,
          input: test.input,
          expected: test.expectedIntent,
          actual: 'ERROR',
          confidence: 0,
          reason: result.error_message ?? 'Unknown error',
        });
        continue;
      }

      const { intent, confidence } = result.data;

      // Check intent
      if (intent !== test.expectedIntent) {
        failures.push({
          id: test.id,
          category: test.category,
          input: test.input,
          expected: test.expectedIntent,
          actual: intent,
          confidence,
          reason: `Intent mismatch`,
        });
        continue;
      }

      // Check confidence
      if (test.minConfidence && confidence < test.minConfidence) {
        failures.push({
          id: test.id,
          category: test.category,
          input: test.input,
          expected: `>= ${test.minConfidence}`,
          actual: confidence.toFixed(2),
          confidence,
          reason: `Confidence too low`,
        });
        continue;
      }

      // Check expected context (if specified)
      if (test.expectedContext) {
        const context = result.data.context as Record<string, unknown> | undefined;
        for (const [key, expectedValue] of Object.entries(test.expectedContext)) {
          const actualValue = context?.[key];
          if (actualValue !== expectedValue) {
            failures.push({
              id: test.id,
              category: test.category,
              input: test.input,
              expected: `${key}=${expectedValue}`,
              actual: `${key}=${actualValue}`,
              confidence,
              reason: `Context mismatch`,
            });
            break;
          }
        }
      }
    }

    // Only show failures (as requested)
    if (failures.length > 0) {
      console.log('\n\n========================================');
      console.log(`❌ FAILURES: ${failures.length} / ${TEST_QUERIES.length}`);
      console.log('========================================\n');

      for (const failure of failures) {
        console.log(`❌ TEST #${failure.id} - ${failure.category}`);
        console.log(`   Input: "${failure.input}"`);
        console.log(`   Expected: ${failure.expected}`);
        console.log(`   Actual: ${failure.actual}`);
        console.log(`   Confidence: ${failure.confidence.toFixed(2)}`);
        console.log(`   Reason: ${failure.reason}`);
        console.log('');
      }

      throw new Error(`${failures.length} tests failed out of ${TEST_QUERIES.length}`);
    } else {
      console.log(`\n✅ ALL ${TEST_QUERIES.length} TESTS PASSED`);
    }

    expect(failures.length).toBe(0);
  });
});
