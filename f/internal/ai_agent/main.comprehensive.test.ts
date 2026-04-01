/**
 * AI Agent - Comprehensive Intent & Entity Extraction Tests
 * 
 * Tests: 100+ real-world user queries
 * Categories: Intent detection, Entity extraction, RAG, Profanity, 
 *             Spelling errors, Dyslexia, Unrelated questions, Edge cases
 * 
 * Only FAILURES are shown (passing tests are silent)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { main } from './main';

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
    expectedIntent: 'create_appointment',
    minConfidence: 0.7
  },
  {
    id: 2,
    category: 'create_appointment',
    input: 'Necesito reservar un turno',
    expectedIntent: 'create_appointment',
    minConfidence: 0.7
  },
  {
    id: 3,
    category: 'create_appointment',
    input: 'Quiero sacar una cita médica',
    expectedIntent: 'create_appointment',
    minConfidence: 0.7
  },
  {
    id: 4,
    category: 'create_appointment',
    input: 'Agendar cita para mañana',
    expectedIntent: 'create_appointment',
    expectedEntities: { date: 'mañana' },
    minConfidence: 0.7
  },
  {
    id: 5,
    category: 'create_appointment',
    input: 'Reservar turno el lunes',
    expectedIntent: 'create_appointment',
    expectedEntities: { date: 'lunes' },
    minConfidence: 0.7
  },
  {
    id: 6,
    category: 'create_appointment',
    input: 'Cita con el Dr. García',
    expectedIntent: 'create_appointment',
    expectedEntities: { provider_name: 'Dr. García' },
    minConfidence: 0.6
  },
  {
    id: 7,
    category: 'create_appointment',
    input: 'Quiero una consulta general',
    expectedIntent: 'create_appointment',
    expectedEntities: { service_type: 'consulta general' },
    minConfidence: 0.6
  },
  {
    id: 8,
    category: 'create_appointment',
    input: 'Agendar para el 15 de marzo',
    expectedIntent: 'create_appointment',
    expectedEntities: { date: '15 de marzo' },
    minConfidence: 0.7
  },
  {
    id: 9,
    category: 'create_appointment',
    input: 'Reservar cita a las 10:00',
    expectedIntent: 'create_appointment',
    expectedEntities: { time: '10:00' },
    minConfidence: 0.7
  },
  {
    id: 10,
    category: 'create_appointment',
    input: 'Turno para la próxima semana',
    expectedIntent: 'create_appointment',
    expectedEntities: { date: 'próxima semana' },
    minConfidence: 0.6
  },
  {
    id: 11,
    category: 'create_appointment',
    input: 'Cita médica urgente',
    expectedIntent: 'urgent_care',  // Should detect urgency
    minConfidence: 0.7
  },
  {
    id: 12,
    category: 'create_appointment',
    input: 'Necesito ver al doctor',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 13,
    category: 'create_appointment',
    input: 'Quiero pedir hora',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 14,
    category: 'create_appointment',
    input: 'Agendar visita médica',
    expectedIntent: 'create_appointment',
    minConfidence: 0.7
  },
  {
    id: 15,
    category: 'create_appointment',
    input: 'Reservar para cardiología',
    expectedIntent: 'create_appointment',
    expectedEntities: { service_type: 'cardiología' },
    minConfidence: 0.6
  },

  // ============================================================================
  // CATEGORY 2: INTENT DETECTION - CANCEL APPOINTMENT (10 queries)
  // ============================================================================
  {
    id: 16,
    category: 'cancel_appointment',
    input: 'Quiero cancelar mi cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.8
  },
  {
    id: 17,
    category: 'cancel_appointment',
    input: 'Necesito anular mi turno',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.8
  },
  {
    id: 18,
    category: 'cancel_appointment',
    input: 'Cancelar la cita que tengo',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.8
  },
  {
    id: 19,
    category: 'cancel_appointment',
    input: 'No puedo asistir, quiero cancelar',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.8
  },
  {
    id: 20,
    category: 'cancel_appointment',
    input: 'Eliminar mi reserva',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.7
  },
  {
    id: 21,
    category: 'cancel_appointment',
    input: 'Dar de baja la cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.6
  },
  {
    id: 22,
    category: 'cancel_appointment',
    input: 'Cancelar cita del lunes',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.8
  },
  {
    id: 23,
    category: 'cancel_appointment',
    input: 'Anular turno con Dr. García',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.7
  },
  {
    id: 24,
    category: 'cancel_appointment',
    input: 'Ya no necesito la cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.6
  },
  {
    id: 25,
    category: 'cancel_appointment',
    input: 'Borrar mi reserva',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.7
  },

  // ============================================================================
  // CATEGORY 3: INTENT DETECTION - RESCHEDULE (10 queries)
  // ============================================================================
  {
    id: 26,
    category: 'reschedule',
    input: 'Quiero cambiar mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.8
  },
  {
    id: 27,
    category: 'reschedule',
    input: 'Necesito reprogramar mi turno',
    expectedIntent: 'reschedule',
    minConfidence: 0.8
  },
  {
    id: 28,
    category: 'reschedule',
    input: 'Mover la cita para otro día',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 29,
    category: 'reschedule',
    input: 'Reagendar mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.8
  },
  {
    id: 30,
    category: 'reschedule',
    input: 'Cambiar la hora de mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 31,
    category: 'reschedule',
    input: 'Pasar mi turno para la semana que viene',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 32,
    category: 'reschedule',
    input: 'Modificar la fecha de mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 33,
    category: 'reschedule',
    input: 'Cambiar cita del lunes al miércoles',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 34,
    category: 'reschedule',
    input: 'Reprogramar para otro horario',
    expectedIntent: 'reschedule',
    minConfidence: 0.7
  },
  {
    id: 35,
    category: 'reschedule',
    input: 'Trasladar mi turno',
    expectedIntent: 'reschedule',
    minConfidence: 0.6
  },

  // ============================================================================
  // CATEGORY 4: INTENT DETECTION - CHECK AVAILABILITY (10 queries)
  // ============================================================================
  {
    id: 36,
    category: 'check_availability',
    input: '¿Qué horas tienen disponibles?',
    expectedIntent: 'check_availability',
    minConfidence: 0.8
  },
  {
    id: 37,
    category: 'check_availability',
    input: '¿Tienen disponibilidad para hoy?',
    expectedIntent: 'check_availability',
    expectedContext: { is_today: true },
    minConfidence: 0.8
  },
  {
    id: 38,
    category: 'check_availability',
    input: '¿Qué días tienen libre?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 39,
    category: 'check_availability',
    input: '¿Me pueden decir si tienen hora?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 40,
    category: 'check_availability',
    input: '¿Hay disponibilidad esta semana?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 41,
    category: 'check_availability',
    input: '¿Qué horarios tienen?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 42,
    category: 'check_availability',
    input: '¿Tienen turno disponible?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 43,
    category: 'check_availability',
    input: '¿Me dicen si tienen lugar?',
    expectedIntent: 'check_availability',
    minConfidence: 0.6
  },
  {
    id: 44,
    category: 'check_availability',
    input: '¿Qué días están disponibles?',
    expectedIntent: 'check_availability',
    minConfidence: 0.7
  },
  {
    id: 45,
    category: 'check_availability',
    input: '¿Tienen huecos libres?',
    expectedIntent: 'check_availability',
    minConfidence: 0.6
  },

  // ============================================================================
  // CATEGORY 5: INTENT DETECTION - URGENT CARE (10 queries)
  // ============================================================================
  {
    id: 46,
    category: 'urgent_care',
    input: '¡Es urgente, necesito atención ya!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 47,
    category: 'urgent_care',
    input: 'Tengo una emergencia médica',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 48,
    category: 'urgent_care',
    input: '¡Necesito una cita urgente!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 49,
    category: 'urgent_care',
    input: 'Es muy urgente, tengo mucho dolor',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 50,
    category: 'urgent_care',
    input: '¡Necesito que me atiendan ahora mismo!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 51,
    category: 'urgent_care',
    input: 'Urgencia, necesito ayuda inmediata',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 52,
    category: 'urgent_care',
    input: '¡Es una emergencia, por favor!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 53,
    category: 'urgent_care',
    input: 'Necesito atención urgente, es importante',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.8
  },
  {
    id: 54,
    category: 'urgent_care',
    input: '¡Urgente, no puedo esperar!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },
  {
    id: 55,
    category: 'urgent_care',
    input: 'Emergencia médica, necesito cita ya',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.9
  },

  // ============================================================================
  // CATEGORY 6: SPELLING ERRORS (10 queries)
  // ============================================================================
  {
    id: 56,
    category: 'spelling_errors',
    input: 'Quiero ajendar una sita',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 57,
    category: 'spelling_errors',
    input: 'Necesito reserbar un turno',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 58,
    category: 'spelling_errors',
    input: 'Quiero kanselar mi cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.6
  },
  {
    id: 59,
    category: 'spelling_errors',
    input: 'Reprogramar mi turno para otro dia',
    expectedIntent: 'reschedule',
    minConfidence: 0.6
  },
  {
    id: 60,
    category: 'spelling_errors',
    input: 'Tienen disponibilidaz?',
    expectedIntent: 'check_availability',
    minConfidence: 0.6
  },
  {
    id: 61,
    category: 'spelling_errors',
    input: 'Urjente, necesito atencion',
    expectedIntent: 'urgent_care',
    minConfidence: 0.7
  },
  {
    id: 62,
    category: 'spelling_errors',
    input: 'Quiero una konsulta general',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 63,
    category: 'spelling_errors',
    input: 'Anular mi reserba',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.6
  },
  {
    id: 64,
    category: 'spelling_errors',
    input: 'Cambiar la ora de mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.6
  },
  {
    id: 65,
    category: 'spelling_errors',
    input: 'Tienen lugar disponsible?',
    expectedIntent: 'check_availability',
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 7: DYSLEXIA SIMULATION (10 queries)
  // ============================================================================
  {
    id: 66,
    category: 'dyslexia',
    input: 'Quiero agnedar una cita',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 67,
    category: 'dyslexia',
    input: 'Necesito resevar un truno',
    expectedIntent: 'create_appointment',
    minConfidence: 0.5
  },
  {
    id: 68,
    category: 'dyslexia',
    input: 'Quiero cancelsr mi cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.6
  },
  {
    id: 69,
    category: 'dyslexia',
    input: 'Reporgramar mi truno',
    expectedIntent: 'reschedule',
    minConfidence: 0.5
  },
  {
    id: 70,
    category: 'dyslexia',
    input: 'Tienen disponiblidad?',
    expectedIntent: 'check_availability',
    minConfidence: 0.5
  },
  {
    id: 71,
    category: 'dyslexia',
    input: 'Urgnete, nececito atencion',
    expectedIntent: 'urgent_care',
    minConfidence: 0.6
  },
  {
    id: 72,
    category: 'dyslexia',
    input: 'Quiero una cosulta',
    expectedIntent: 'create_appointment',
    minConfidence: 0.5
  },
  {
    id: 73,
    category: 'dyslexia',
    input: 'Anualr mi resera',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.5
  },
  {
    id: 74,
    category: 'dyslexia',
    input: 'Cambiar la hor de mi cita',
    expectedIntent: 'reschedule',
    minConfidence: 0.5
  },
  {
    id: 75,
    category: 'dyslexia',
    input: 'Tienen lugr disponible?',
    expectedIntent: 'check_availability',
    minConfidence: 0.4
  },

  // ============================================================================
  // CATEGORY 8: PROFANITY / COLOQUIALISMOS (5 queries)
  // ============================================================================
  {
    id: 76,
    category: 'profanity',
    input: 'Quiero agendar una cita, carajo',
    expectedIntent: 'create_appointment',
    minConfidence: 0.6
  },
  {
    id: 77,
    category: 'profanity',
    input: 'Necesito cancelar mi puta cita',
    expectedIntent: 'cancel_appointment',
    minConfidence: 0.7
  },
  {
    id: 78,
    category: 'profanity',
    input: 'Reprogramar mi turno, mierda',
    expectedIntent: 'reschedule',
    minConfidence: 0.6
  },
  {
    id: 79,
    category: 'profanity',
    input: '¡Es urgente, coño!',
    expectedIntent: 'urgent_care',
    expectedContext: { is_urgent: true },
    minConfidence: 0.7
  },
  {
    id: 80,
    category: 'profanity',
    input: 'Tienen disponibilidad o qué, carajo?',
    expectedIntent: 'check_availability',
    minConfidence: 0.6
  },

  // ============================================================================
  // CATEGORY 9: UNRELATED QUESTIONS (10 queries)
  // ============================================================================
  {
    id: 81,
    category: 'unrelated',
    input: '¿Qué tiempo hace hoy?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 82,
    category: 'unrelated',
    input: '¿Cuál es la capital de Francia?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 83,
    category: 'unrelated',
    input: '¿Me puedes contar un chiste?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 84,
    category: 'unrelated',
    input: '¿Qué hora es?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 85,
    category: 'unrelated',
    input: '¿Quién es el presidente?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 86,
    category: 'unrelated',
    input: '¿Cómo se hace una paella?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 87,
    category: 'unrelated',
    input: '¿Qué películas hay en el cine?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 88,
    category: 'unrelated',
    input: '¿Cuánto es 2 + 2?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 89,
    category: 'unrelated',
    input: '¿Dónde queda el restaurante más cercano?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },
  {
    id: 90,
    category: 'unrelated',
    input: '¿Qué equipo de fútbol gana hoy?',
    expectedIntent: 'general_question',
    minConfidence: 0.5
  },

  // ============================================================================
  // CATEGORY 10: GREETINGS / FAREWELLS (10 queries)
  // ============================================================================
  {
    id: 91,
    category: 'greetings',
    input: 'Hola',
    expectedIntent: 'greeting',
    minConfidence: 0.8
  },
  {
    id: 92,
    category: 'greetings',
    input: 'Buenos días',
    expectedIntent: 'greeting',
    minConfidence: 0.8
  },
  {
    id: 93,
    category: 'greetings',
    input: 'Buenas tardes',
    expectedIntent: 'greeting',
    minConfidence: 0.8
  },
  {
    id: 94,
    category: 'greetings',
    input: 'Hola, ¿qué tal?',
    expectedIntent: 'greeting',
    minConfidence: 0.7
  },
  {
    id: 95,
    category: 'greetings',
    input: 'Saludos',
    expectedIntent: 'greeting',
    minConfidence: 0.7
  },
  {
    id: 96,
    category: 'farewells',
    input: 'Chau',
    expectedIntent: 'farewell',
    minConfidence: 0.7
  },
  {
    id: 97,
    category: 'farewells',
    input: 'Adiós',
    expectedIntent: 'farewell',
    minConfidence: 0.8
  },
  {
    id: 98,
    category: 'farewells',
    input: 'Hasta luego',
    expectedIntent: 'farewell',
    minConfidence: 0.7
  },
  {
    id: 99,
    category: 'farewells',
    input: 'Nos vemos',
    expectedIntent: 'farewell',
    minConfidence: 0.7
  },
  {
    id: 100,
    category: 'farewells',
    input: 'Gracias',
    expectedIntent: 'thank_you',
    minConfidence: 0.8
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

      const { intent, confidence, entities, context } = result.data;

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

      // Check expected entities (if specified)
      if (test.expectedEntities) {
        for (const [key, expectedValue] of Object.entries(test.expectedEntities)) {
          const actualValue = entities?.[key];
          if (actualValue !== expectedValue) {
            failures.push({
              id: test.id,
              category: test.category,
              input: test.input,
              expected: `${key}=${expectedValue}`,
              actual: `${key}=${actualValue}`,
              confidence,
              reason: `Entity mismatch`,
            });
            break;
          }
        }
      }

      // Check expected context (if specified)
      if (test.expectedContext) {
        for (const [key, expectedValue] of Object.entries(test.expectedContext)) {
          const actualValue = (context as Record<string, unknown>)?.[key];
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
