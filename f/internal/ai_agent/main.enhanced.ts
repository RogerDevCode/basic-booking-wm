import { z } from "zod";
import "@total-typescript/ts-reset";

// ============================================================================
// FIX #1: REALISTIC CONFIDENCE THRESHOLDS (Research-based)
// ============================================================================

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  urgent_care: 0.5,           // 1 keyword urgente
  cancel_appointment: 0.5,    // 1 keyword cancel
  reschedule: 0.5,            // 1 keyword change
  create_appointment: 0.3,    // 1 keyword booking
  check_availability: 0.3,    // 1 keyword availability
  greeting: 0.5,              // 1 keyword greeting
  farewell: 0.5,              // 1 keyword farewell
  thank_you: 0.5,             // 1 keyword thanks
  general_question: 0.5,      // off-topic detection
  unknown: 0.0,
};

// ============================================================================
// FIX #2: UNIFIED INTENT NAMES (No 'reschedule_appointment')
// ============================================================================

const INTENTS = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule',  // ✅ Unified name
  CHECK_AVAILABILITY: 'check_availability',
  URGENT_CARE: 'urgent_care',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  GENERAL_QUESTION: 'general_question',
  UNKNOWN: 'unknown',
} as const;

// ============================================================================
// FIX #3: ENHANCED KEYWORDS WITH WEIGHTS
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

// ============================================================================
// FIX #4: NORMALIZATION MAP FOR SPELLING ERRORS
// ============================================================================

const NORMALIZATION_MAP: Record<string, string> = {
  // Spelling errors
  'ajendar': 'agendar',
  'ajenda': 'agenda',
  'sitа': 'cita',
  'sita': 'cita',
  'reserbar': 'reservar',
  'reserba': 'reserva',
  'kanselar': 'cancelar',
  'kansela': 'cancela',
  'kambiar': 'cambiar',
  'kambia': 'cambia',
  'disponiblidad': 'disponibilidad',
  'disponible': 'disponible',
  'konsulta': 'consulta',
  'konsulto': 'consulto',
  'ora': 'hora',
  'oras': 'horas',
  'lugr': 'lugar',
  'lugare': 'lugar',
  'turno': 'turno',
  'truno': 'turno',
  'turnos': 'turnos',
  'trunos': 'turnos',
  'medica': 'médica',
  'medico': 'médico',
  'atencion': 'atención',
  'urgente': 'urgente',
  'urjente': 'urgente',
  'urgencia': 'urgencia',
  'urjencia': 'urgencia',
  'reprogramar': 'reprogramar',
  'reporgramar': 'reprogramar',
  'cancelsr': 'cancelar',
  'canelar': 'cancelar',
  'anualr': 'anular',
  'anular': 'anular',
  'resera': 'reserva',
  'reserba': 'reserva',
  'disponsible': 'disponible',
  'disponsible': 'disponible',
};

// ============================================================================
// FIX #5: PROFANITY FILTER
// ============================================================================

const PROFANITY_TO_IGNORE = [
  'carajo', 'puta', 'puto', 'mierda', 'coño', 'joder', 'joda',
  'boludo', 'pelotudo', 'gil', 'idiota', 'estupido', 'estúpido',
  'maldita', 'maldito', 'rayos', 'diablos', 'verga', 'pinga',
];

function removeProfanity(text: string): string {
  let clean = text.toLowerCase();
  for (const word of PROFANITY_TO_IGNORE) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  return clean.trim().replace(/\s+/g, ' ');
}

// ============================================================================
// FIX #6: GREETING/FAREWELL DETECTION
// ============================================================================

function detectGreetingOrFarewell(text: string): { type: string; confidence: number } | null {
  const lower = text.toLowerCase().trim();
  
  // Greetings
  if (lower === 'hola' || lower === 'holaa' || lower === 'ola' || 
      lower.includes('buenos días') || lower.includes('buenas tardes') || 
      lower.includes('buenas noches') || lower.includes('qué tal') || 
      lower.includes('que tal') || lower === 'saludos' || lower === 'buen día') {
    return { type: INTENTS.GREETING, confidence: 0.9 };
  }
  
  // Farewells
  if (lower === 'chau' || lower === 'chao' || lower === 'adiós' || 
      lower === 'adios' || lower.includes('hasta luego') || 
      lower.includes('nos vemos') || lower.includes('hasta pronto')) {
    return { type: INTENTS.FAREWELL, confidence: 0.9 };
  }
  
  // Thanks
  if (lower.includes('gracias') || lower.includes('agradezco') || 
      lower.includes('mil gracias') || lower.includes('muchas gracias')) {
    return { type: INTENTS.THANK_YOU, confidence: 0.9 };
  }
  
  return null;
}

// ============================================================================
// FIX #7: OFF-TOPIC DETECTION
// ============================================================================

const OFF_TOPIC_PATTERNS = [
  '¿qué tiempo hace', 'que tiempo hace', 'cómo está el clima',
  '¿cuál es la capital', 'cual es la capital', '¿dónde queda',
  '¿me puedes contar', '¿me puedes decir', '¿sabes',
  '¿qué hora es', 'que hora es', '¿tienes hora',
  '¿quién es el', 'quien es el', '¿quién ganó',
  '¿cómo se hace', 'como se hace', '¿cómo hacer',
  '¿qué películas', 'que peliculas', '¿qué series',
  '¿cuánto es', 'cuanto es', '¿cuánto cuesta',
  '¿dónde queda', 'donde queda', '¿dónde está',
  '¿qué equipo', 'que equipo', '¿quién gana',
  'chiste', 'broma', 'acertijo', 'adivinanza',
  'receta', 'cocinar', 'preparar',
  'noticias', 'periódico', 'diario',
];

function isOffTopic(text: string): boolean {
  const lower = text.toLowerCase();
  return OFF_TOPIC_PATTERNS.some(pattern => lower.includes(pattern));
}

// ============================================================================
// FIX #8: LEVENSHTEIN DISTANCE FOR FUZZY MATCHING
// ============================================================================

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[b.length][a.length];
}

function fuzzyMatch(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  
  // Exact match
  if (lowerText.includes(lowerKeyword)) return true;
  
  // Fuzzy match (distance <= 2 for short words, <= 3 for long words)
  const maxDistance = lowerKeyword.length <= 4 ? 1 : lowerKeyword.length <= 6 ? 2 : 3;
  
  // Check word by word
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (levenshtein(word, lowerKeyword) <= maxDistance) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// MAIN TEXT NORMALIZATION
// ============================================================================

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  // Remove profanity first
  normalized = removeProfanity(normalized);
  
  // Apply normalization map
  for (const [wrong, correct] of Object.entries(NORMALIZATION_MAP)) {
    normalized = normalized.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), correct);
  }
  
  return normalized.trim();
}

// ============================================================================
// INTENT DETECTION (ENHANCED)
// ============================================================================

function detectIntent(text: string): { intent: string; confidence: number } {
  // FIX #6: Check greetings/farewells first
  const greeting = detectGreetingOrFarewell(text);
  if (greeting) {
    return { intent: greeting.type, confidence: greeting.confidence };
  }
  
  // FIX #7: Check off-topic
  if (isOffTopic(text)) {
    return { intent: INTENTS.GENERAL_QUESTION, confidence: 0.8 };
  }
  
  // Normalize text (FIX #4 + #5)
  const normalizedText = normalizeText(text);
  
  // Score intents with fuzzy matching (FIX #8)
  let bestIntent = INTENTS.UNKNOWN;
  let maxScore = 0;
  
  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    
    for (const keyword of config.keywords) {
      // Use fuzzy matching instead of exact match
      if (fuzzyMatch(normalizedText, keyword)) {
        score += config.weight;
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestIntent = intent;
    }
  }
  
  // Calculate confidence based on realistic thresholds (FIX #1)
  const confidence = maxScore > 0 
    ? Math.min(1.0, maxScore / (CONFIDENCE_THRESHOLDS[bestIntent] * 3))
    : 0.1;
  
  return { intent: bestIntent, confidence };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  INTENTS,
  CONFIDENCE_THRESHOLDS,
  NORMALIZATION_MAP,
  PROFANITY_TO_IGNORE,
  OFF_TOPIC_PATTERNS,
  normalizeText,
  detectIntent,
  levenshtein,
  fuzzyMatch,
  removeProfanity,
  detectGreetingOrFarewell,
  isOffTopic,
};
