// ============================================================================
// INTENT CONSTANTS — Single Source of Truth (v3)
// Unifica nombres de intents para todo el sistema AI Agent
// ============================================================================

export const INTENT = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule',
  CHECK_AVAILABILITY: 'check_availability',
  URGENT_CARE: 'urgent_care',
  GENERAL_QUESTION: 'general_question',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  UNKNOWN: 'unknown',
} as const;

export type IntentType = (typeof INTENT)[keyof typeof INTENT];

// ============================================================================
// CONFIDENCE THRESHOLDS
// Umbrales realistas por intent (basados en 100 tests de validación)
// ============================================================================

export const CONFIDENCE_THRESHOLDS: Record<IntentType, number> = {
  [INTENT.URGENT_CARE]: 0.5,
  [INTENT.CANCEL_APPOINTMENT]: 0.5,
  [INTENT.RESCHEDULE]: 0.5,
  [INTENT.CREATE_APPOINTMENT]: 0.3,
  [INTENT.CHECK_AVAILABILITY]: 0.3,
  [INTENT.GREETING]: 0.5,
  [INTENT.FAREWELL]: 0.5,
  [INTENT.THANK_YOU]: 0.5,
  [INTENT.GENERAL_QUESTION]: 0.5,
  [INTENT.UNKNOWN]: 0.0,
};

// ============================================================================
// INTENT KEYWORDS + WEIGHTS (para fallback rule-based)
// ============================================================================

export const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENT.URGENT_CARE]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'],
    weight: 10,
  },
  [INTENT.CANCEL_APPOINTMENT]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar', 'dar de baja', 'no necesito'],
    weight: 4,
  },
  [INTENT.RESCHEDULE]: {
    keywords: ['reprogramar', 'reagendar', 'cambiar', 'mover', 'trasladar', 'pasar', 'modificar'],
    weight: 4,
  },
  [INTENT.CHECK_AVAILABILITY]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tienen', 'lugar', 'horario', 'busco'],
    weight: 3,
  },
  [INTENT.CREATE_APPOINTMENT]: {
    keywords: ['reservar', 'agendar', 'cita', 'turno', 'sacar', 'pedir hora', 'necesito hora', 'consulta', 'visita', 'ver al doctor'],
    weight: 3,
  },
};

// ============================================================================
// SPELLING NORMALIZATION MAP (40+ entries)
// Mapea errores ortográficos comunes → palabra correcta
// ============================================================================

export const NORMALIZATION_MAP: Record<string, string> = {
  'ajendar': 'agendar', 'sita': 'cita', 'kita': 'cita',
  'reserbar': 'reservar', 'reserba': 'reserva',
  'kanselar': 'cancelar', 'kansela': 'cancela', 'cancelsr': 'cancelar', 'canelar': 'cancelar',
  'kambiar': 'cambiar', 'kambia': 'cambia',
  'disponiblidad': 'disponibilidad', 'disponsible': 'disponible', 'disponibilidaz': 'disponibilidad',
  'konsulta': 'consulta', 'konsulto': 'consulto', 'cosulta': 'consulta',
  'ora': 'hora', 'oras': 'horas',
  'lugr': 'lugar', 'lugare': 'lugar',
  'truno': 'turno', 'trunos': 'turnos',
  'urjente': 'urgente', 'urjencia': 'urgencia', 'urgnete': 'urgente',
  'reporgramar': 'reprogramar',
  'anualr': 'anular',
  'resera': 'reserva',
  'agnedar': 'agendar', 'resevar': 'reservar',
  'nececito': 'necesito', 'hor': 'hora',
  'grasias': 'gracias', 'ola': 'hola', 'holaa': 'hola',
  'chao': 'chau', 'adios': 'adiós',
  'qiero': 'quiero',
};

// ============================================================================
// PROFANITY FILTER
// Palabras a ignorar/limpiar antes de clasificar intent
// ============================================================================

export const PROFANITY_TO_IGNORE = ['carajo', 'puta', 'puto', 'mierda', 'coño', 'joder', 'boludo', 'pelotudo'];

// ============================================================================
// OFF-TOPIC PATTERNS
// Patrones para detectar mensajes fuera del dominio médico
// ============================================================================

export const OFF_TOPIC_PATTERNS = [
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

// ============================================================================
// GREETING / FAREWELL / THANK YOU LISTS
// Para fast-path detection (evita llamada LLM)
// ============================================================================

export const GREETINGS = ['hola', 'holaa', 'ola'];
export const GREETING_PHRASES = ['buenos días', 'buenas tardes', 'buenas noches', 'buen día', 'qué tal'];
export const FAREWELLS = ['chau', 'chao', 'adiós', 'adios'];
export const FAREWELL_PHRASES = ['hasta luego', 'nos vemos', 'hasta pronto'];
export const THANK_YOU_WORDS = ['gracias', 'agradezco', 'te agradezco', 'mil gracias'];

// ============================================================================
// URGENCY WORDS (para cross-check post-LLM)
// ============================================================================

export const URGENCY_WORDS = ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'];

// ============================================================================
// FLEXIBILITY KEYWORDS
// ============================================================================

export const FLEXIBILITY_KEYWORDS = ['cualquier', 'lo que tengas', 'lo que conviene', 'lo que más conviene', 'indistinto', 'flexible', 'lo que tengas disponible'];

// ============================================================================
// DAY NAMES (Spanish → English mapping)
// ============================================================================

export const DAY_NAMES: Record<string, string> = {
  'lunes': 'monday', 'martes': 'tuesday', 'miércoles': 'wednesday', 'miercoles': 'wednesday',
  'jueves': 'thursday', 'viernes': 'friday', 'sábado': 'saturday', 'sabado': 'saturday', 'domingo': 'sunday',
};

// ============================================================================
// RELATIVE DATES
// ============================================================================

export const RELATIVE_DATES = ['hoy', 'mañana', 'manana', 'pasado mañana', 'pasado manana', 'esta semana', 'próxima semana', 'la semana que viene'];

// ============================================================================
// SERVICE TYPES (para entity extraction)
// ============================================================================

export const SERVICE_TYPES = [
  'consulta general', 'cardiología', 'cardiologia', 'pediatría', 'pediatria',
  'dermatología', 'dermatologia', 'ginecología', 'ginecologia',
  'psicología', 'psicologia', 'odontología', 'odontologia',
  'limpieza', 'rayos x', 'laboratorio', 'análisis', 'analisis',
];
