import { z } from "zod";
import "@total-typescript/ts-reset";

// ============================================================================
// FIX #1: REALISTIC CONFIDENCE THRESHOLDS (Research-based)
// ============================================================================

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  urgent_care: 0.5,
  cancel_appointment: 0.5,
  reschedule: 0.5,
  create_appointment: 0.3,
  check_availability: 0.3,
  greeting: 0.5,
  farewell: 0.5,
  thank_you: 0.5,
  general_question: 0.5,
  unknown: 0.0,
};

// ============================================================================
// FIX #2: UNIFIED INTENT NAMES
// ============================================================================

const INTENTS = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule',
  CHECK_AVAILABILITY: 'check_availability',
  URGENT_CARE: 'urgent_care',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  GENERAL_QUESTION: 'general_question',
  UNKNOWN: 'unknown',
} as const;

// ============================================================================
// FIX #3-8: ENHANCED KEYWORDS, NORMALIZATION, PROFANITY, GREETINGS, OFF-TOPIC, FUZZY
// ============================================================================

const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENTS.URGENT_CARE]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'],
    weight: 5,
  },
  [INTENTS.CANCEL_APPOINTMENT]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar', 'dar de baja'],
    weight: 4,
  },
  [INTENTS.RESCHEDULE]: {
    keywords: ['reprogramar', 'cambiar', 'mover', 'trasladar', 'pasar', 'modificar', 'reagendar'],
    weight: 4,
  },
  [INTENTS.CHECK_AVAILABILITY]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tiene', 'tienen', 'lugar'],
    weight: 3,
  },
  [INTENTS.CREATE_APPOINTMENT]: {
    keywords: ['reservar', 'agendar', 'citar', 'crear', 'nueva', 'nuevo', 'turno', 'sacar', 'pedir', 'visita'],
    weight: 3,
  },
  [INTENTS.GREETING]: {
    keywords: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'qué tal', 'saludos', 'buen día'],
    weight: 5,
  },
  [INTENTS.FAREWELL]: {
    keywords: ['chau', 'chao', 'adiós', 'hasta luego', 'nos vemos', 'hasta pronto'],
    weight: 5,
  },
  [INTENTS.THANK_YOU]: {
    keywords: ['gracias', 'muchas gracias', 'te agradezco', 'mil gracias', 'agradezco'],
    weight: 5,
  },
};

const NORMALIZATION_MAP: Record<string, string> = {
  // Spelling errors (vocales cambiadas)
  'ajendar': 'agendar', 'sitа': 'cita', 'sita': 'cita', 'kita': 'cita',
  'reserbar': 'reservar', 'reserba': 'reserva',
  'kanselar': 'cancelar', 'kansela': 'cancela', 'cancelsr': 'cancelar', 'canelar': 'cancelar',
  'kambiar': 'cambiar', 'kambia': 'cambia',
  'disponiblidad': 'disponibilidad', 'disponsible': 'disponible',
  'konsulta': 'consulta', 'konsulto': 'consulto', 'cosulta': 'consulta',
  'ora': 'hora', 'oras': 'horas',
  'lugr': 'lugar', 'lugare': 'lugar',
  'truno': 'turno', 'trunos': 'turnos',
  'urjente': 'urgente', 'urjencia': 'urgencia',
  'reporgramar': 'reprogramar',
  'anualr': 'anular', 'anular': 'anular',
  'resera': 'reserva', 'reserba': 'reserva',
  // Regionales/phonetic
  'grasias': 'gracias', 'ola': 'hola', 'holaa': 'hola',
  'chao': 'chau', 'adios': 'adiós',
  'dond': 'donde', 'dnde': 'donde',
  'cuant': 'cuánto', 'cuanto': 'cuánto',
  'cual': 'cuál', 'donde': 'dónde',
  'quien': 'quién', 'como': 'cómo',
  'que': 'qué', 'dia': 'día', 'mas': 'más',
  'qiero': 'quiero', 'necesito': 'necesito',
};

const PROFANITY_TO_IGNORE = ['carajo', 'puta', 'puto', 'mierda', 'coño', 'joder', 'boludo', 'pelotudo'];

const OFF_TOPIC_PATTERNS = [
  '¿qué tiempo hace', 'que tiempo hace', 'cómo está el clima', 'como esta el clima',
  '¿cuál es la capital', 'cual es la capital', '¿dónde queda', 'donde queda',
  '¿me puedes contar', '¿me puedes decir', '¿sabes', '¿puedes decirme',
  '¿qué hora es', 'que hora es', '¿tienes hora', 'tienes hora',
  '¿quién es el', 'quien es el', '¿quién ganó', 'quien gano',
  '¿cómo se hace', 'como se hace', '¿cómo hacer', 'como hacer',
  '¿qué películas', 'que peliculas', '¿qué series', 'que series',
  '¿cuánto es', 'cuanto es', '¿cuánto cuesta', 'cuanto cuesta',
  '¿dónde está', 'donde esta', '¿dónde queda', 'donde queda',
  '¿qué equipo', 'que equipo', '¿quién gana', 'quien gana',
  'chiste', 'broma', 'acertijo', 'adivinanza',
  'receta', 'cocinar', 'preparar', 'cómo hacer', 'como hacer',
  'noticias', 'periódico', 'diario', 'prensa',
  'fútbol', 'película', 'cine', 'tele', 'televisión',
  'presidente', 'gobierno', 'política', 'economia',
];

function removeProfanity(text: string): string {
  let clean = text.toLowerCase();
  for (const word of PROFANITY_TO_IGNORE) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  return clean.trim().replace(/\s+/g, ' ');
}

function detectGreetingOrFarewell(text: string): { type: string; confidence: number } | null {
  const lower = text.toLowerCase().trim();
  if (['hola', 'holaa', 'ola'].includes(lower) || lower.includes('buenos días') || lower.includes('buenas tardes') || lower.includes('buenas noches')) {
    return { type: INTENTS.GREETING, confidence: 0.9 };
  }
  if (['chau', 'chao', 'adiós', 'adios'].includes(lower) || lower.includes('hasta luego') || lower.includes('nos vemos')) {
    return { type: INTENTS.FAREWELL, confidence: 0.9 };
  }
  if (lower.includes('gracias') || lower.includes('agradezco')) {
    return { type: INTENTS.THANK_YOU, confidence: 0.9 };
  }
  return null;
}

function isOffTopic(text: string): boolean {
  const lower = text.toLowerCase();
  return OFF_TOPIC_PATTERNS.some(pattern => lower.includes(pattern));
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  if (lowerText.includes(lowerKeyword)) return true;
  const maxDistance = lowerKeyword.length <= 4 ? 1 : lowerKeyword.length <= 6 ? 2 : 3;
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (levenshtein(word, lowerKeyword) <= maxDistance) return true;
  }
  return false;
}

function normalizeText(text: string): string {
  let normalized = removeProfanity(text.toLowerCase());
  for (const [wrong, correct] of Object.entries(NORMALIZATION_MAP)) {
    normalized = normalized.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), correct);
  }
  return normalized.trim();
}

function detectIntent(text: string): { intent: string; confidence: number } {
  const greeting = detectGreetingOrFarewell(text);
  if (greeting) return greeting;
  if (isOffTopic(text)) return { intent: INTENTS.GENERAL_QUESTION, confidence: 0.8 };
  const normalizedText = normalizeText(text);
  let bestIntent = INTENTS.UNKNOWN;
  let maxScore = 0;
  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (fuzzyMatch(normalizedText, keyword)) score += config.weight;
    }
    if (score > maxScore) { maxScore = score; bestIntent = intent; }
  }
  const confidence = maxScore > 0 ? Math.min(1.0, maxScore / (CONFIDENCE_THRESHOLDS[bestIntent] * 3)) : 0.1;
  return { intent: bestIntent, confidence };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null }> {
  try {
    const input = z.object({ chat_id: z.string(), text: z.string() }).safeParse(rawInput);
    if (!input.success) {
      return { success: false, data: null, error_message: `Invalid input: ${input.error.message}` };
    }

    const { intent, confidence } = detectIntent(input.data.text);

    // Detect context
    const is_today = input.data.text.includes('hoy');
    const is_tomorrow = input.data.text.includes('mañana') || input.data.text.includes('manana');

    return {
      success: true,
      data: {
        intent,
        confidence,
        chat_id: input.data.chat_id,
        entities: {},
        context: { 
          is_urgent: intent === INTENTS.URGENT_CARE,
          is_today,
          is_tomorrow,
          is_flexible: input.data.text.includes('cualquier') || input.data.text.includes('lo que'),
          is_specific_date: false,
          time_preference: 'any' as const,
          day_preference: null
        },
        suggested_response_type: intent === INTENTS.GREETING ? 'greeting_response' : 
                                 intent === INTENTS.FAREWELL ? 'fallback' :
                                 intent === INTENTS.THANK_YOU ? 'fallback' : 'fallback',
        ai_response: `Intent: ${intent}, Confidence: ${confidence.toFixed(2)}`,
        needs_more_info: false,
        follow_up_question: null,
        cot_reasoning: '',
        validation_passed: true,
        validation_errors: [],
      },
      error_message: null,
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { success: false, data: null, error_message: error.message };
  }
}

export { INTENTS, CONFIDENCE_THRESHOLDS, NORMALIZATION_MAP, normalizeText, detectIntent, levenshtein, fuzzyMatch };
