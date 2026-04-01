import { z } from "zod";
import "@total-typescript/ts-reset";

// ============================================================================
// CONFIGURACIÓN Y CONSTANTES
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

const INTENTS = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule_appointment',  // Compatible con tests existentes
  CHECK_AVAILABILITY: 'check_availability',
  URGENT_CARE: 'urgent_care',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  GENERAL_QUESTION: 'general_question',
  UNKNOWN: 'unknown',
} as const;

const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENTS.URGENT_CARE]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'],
    weight: 10,
  },
  [INTENTS.CANCEL_APPOINTMENT]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar', 'dar de baja', 'no necesito'],
    weight: 4,
  },
  [INTENTS.RESCHEDULE]: {
    keywords: ['reprogramar', 'reagendar', 'cambiar', 'mover', 'trasladar', 'pasar', 'modificar'],
    weight: 4,
  },
  [INTENTS.CHECK_AVAILABILITY]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tienen', 'lugar', 'horario', 'busco'],
    weight: 3,
  },
  [INTENTS.CREATE_APPOINTMENT]: {
    keywords: ['reservar', 'agendar', 'cita', 'turno', 'sacar', 'pedir hora', 'necesito hora', 'consulta', 'visita', 'ver al doctor'],
    weight: 3,
  },
};

const NORMALIZATION_MAP: Record<string, string> = {
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

const PROFANITY_TO_IGNORE = ['carajo', 'puta', 'puto', 'mierda', 'coño', 'joder', 'boludo', 'pelotudo'];

function removeProfanity(text: string): string {
  let clean = text.toLowerCase();
  for (const word of PROFANITY_TO_IGNORE) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  return clean.trim().replace(/\s+/g, ' ');
}

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

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

interface AIAgentEntities {
  readonly date: string | null;
  readonly time: string | null;
  readonly provider_name: string | null;
  readonly provider_id: string | null;
  readonly service_type: string | null;
  readonly service_id: string | null;
  readonly booking_id: string | null;
}

function extractEntities(text: string): AIAgentEntities {
  const lowerText = text.toLowerCase();
  
  let date: string | null = null;
  let time: string | null = null;
  let provider_name: string | null = null;
  let provider_id: string | null = null;
  let service_type: string | null = null;
  let service_id: string | null = null;
  let booking_id: string | null = null;

  // Date extraction - relative dates
  const relativeDates = ['hoy', 'mañana', 'manana', 'pasado mañana', 'pasado manana', 'esta semana', 'próxima semana', 'la semana que viene'];
  for (const relDate of relativeDates) {
    if (lowerText.includes(relDate)) {
      date = relDate;
      break;
    }
  }

  // Date extraction - explicit dates (DD/MM, DD-MM, DD/MM/YYYY)
  if (!date) {
    const datePatterns = [
      /\b(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/,
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
      /\b(\d{1,2}[\/\-]\d{1,2})\b/,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        date = match[1];
        break;
      }
    }
  }

  // Date extraction - day names
  if (!date) {
    const dayNames = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];
    for (const day of dayNames) {
      if (lowerText.includes(day)) {
        date = day;
        break;
      }
    }
  }

  // Time extraction
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm|hrs|horas)?)/i,
    /(\d{1,2}\s*(am|pm|hrs|horas))/i,
    /las\s*(\d{1,2})\s*(am|pm|horas)?/i,
  ];
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      time = match[1].trim();
      break;
    }
  }

  // Provider name extraction (Dr. X, Doctor X)
  const providerPatterns = [
    /(?:dr|doctor|doctora)\.?\s+([A-Z][a-z]+)/i,
    /(?:con|para)\s+el\s+(?:dr|doctor)\.?\s+([A-Z][a-z]+)/i,
  ];
  for (const pattern of providerPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      provider_name = `Dr. ${match[1]}`;
      break;
    }
  }

  // Service type extraction
  const serviceKeywords = ['consulta general', 'cardiología', 'cardiologia', 'pediatría', 'pediatria', 'dermatología', 'dermatologia', 'ginecología', 'ginecologia', 'psicología', 'psicologia', 'odontología', 'odontologia', 'limpieza', 'rayos x', 'laboratorio', 'análisis', 'analisis'];
  for (const service of serviceKeywords) {
    if (lowerText.includes(service)) {
      service_type = service;
      break;
    }
  }

  // Exact provider_id extraction
  const provIdMatch = text.match(/proveedor\s+(\w+)/i);
  if (provIdMatch?.[1]) {
    provider_id = provIdMatch[1];
  }

  // Exact service_id extraction
  const servIdMatch = text.match(/servicio\s+(\w+)/i);
  if (servIdMatch?.[1]) {
    service_id = servIdMatch[1];
  }

  // Booking ID extraction (UUID-like or numeric)
  const bookingPatterns = [
    /(?:cita|reserva|turno|booking)\s*(?:id|número|numero)?\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    /\b([A-Z]{2,}\d{3,})\b/,
  ];
  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      booking_id = match[1];
      break;
    }
  }

  return { date, time, provider_name, provider_id, service_type, service_id, booking_id };
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

interface AvailabilityContext {
  readonly is_today: boolean;
  readonly is_tomorrow: boolean;
  readonly is_urgent: boolean;
  readonly is_flexible: boolean;
  readonly is_specific_date: boolean;
  readonly time_preference: 'morning' | 'afternoon' | 'evening' | 'any';
  readonly day_preference: string | null;
}

function detectContext(text: string, entities: AIAgentEntities): AvailabilityContext {
  const lowerText = text.toLowerCase();
  
  // is_today detection
  const is_today = lowerText.includes('hoy') || entities.date === 'hoy';
  
  // is_tomorrow detection
  const is_tomorrow = lowerText.includes('mañana') || lowerText.includes('manana') || entities.date === 'mañana' || entities.date === 'tomorrow';
  
  // is_urgent detection
  const urgencyWords = ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando'];
  const is_urgent = urgencyWords.some(w => lowerText.includes(w));
  
  // is_flexible detection
  const is_flexible = lowerText.includes('cualquier') || lowerText.includes('lo que') || lowerText.includes('indistinto') || lowerText.includes('flexible');
  
  // is_specific_date detection
  const is_specific_date = entities.date !== null;
  
  // time_preference detection
  let time_preference: 'morning' | 'afternoon' | 'evening' | 'any' = 'any';
  const morningKeywords = ['mañana', 'antes de las 12', 'am', 'temprano'];
  const afternoonKeywords = ['tarde', 'después de las', 'pm', 'despues'];
  const eveningKeywords = ['noche', 'después de las 18', 'despues de las 18'];
  
  if (morningKeywords.some(k => lowerText.includes(k))) {
    time_preference = 'morning';
  } else if (afternoonKeywords.some(k => lowerText.includes(k))) {
    time_preference = 'afternoon';
  } else if (eveningKeywords.some(k => lowerText.includes(k))) {
    time_preference = 'evening';
  }
  
  // day_preference detection
  let day_preference: string | null = null;
  const dayNames: Record<string, string> = {
    'lunes': 'monday', 'martes': 'tuesday', 'miércoles': 'wednesday', 'miercoles': 'wednesday',
    'jueves': 'thursday', 'viernes': 'friday', 'sábado': 'saturday', 'sabado': 'saturday', 'domingo': 'sunday'
  };
  for (const [spanish, english] of Object.entries(dayNames)) {
    if (lowerText.includes(spanish)) {
      day_preference = english;
      break;
    }
  }
  
  return {
    is_today,
    is_tomorrow,
    is_urgent,
    is_flexible,
    is_specific_date,
    time_preference,
    day_preference
  };
}

// ============================================================================
// SUGGESTED RESPONSE TYPE
// ============================================================================

type SuggestedResponseType =
  | 'availability_list'
  | 'no_availability_today'
  | 'no_availability_extended'
  | 'urgent_options'
  | 'general_search'
  | 'filtered_search'
  | 'booking_confirmation'
  | 'cancellation_flow'
  | 'reschedule_flow'
  | 'clarifying_question'
  | 'greeting_response'
  | 'fallback';

function suggestResponseType(
  intent: string,
  context: AvailabilityContext,
  entities: AIAgentEntities
): SuggestedResponseType {
  // Urgency first
  if (context.is_urgent || intent === INTENTS.URGENT_CARE) {
    return 'urgent_options';
  }

  // Greeting/farewell/thank you
  if (intent === INTENTS.GREETING) return 'greeting_response';
  if (intent === INTENTS.FAREWELL) return 'fallback';
  if (intent === INTENTS.THANK_YOU) return 'fallback';

  // Booking flows
  if (intent === INTENTS.CANCEL_APPOINTMENT) return 'cancellation_flow';
  if (intent === INTENTS.RESCHEDULE) return 'reschedule_flow';

  if (intent === INTENTS.CREATE_APPOINTMENT) {
    if (context.is_flexible) {
      return 'general_search';
    }
    // If they provided a day_preference or time_preference but no exact time, they need options
    if ((context.day_preference !== null || context.time_preference !== 'any') && !entities.time) {
      return 'filtered_search';
    }
    if (!entities.date && !entities.time) {
      return 'clarifying_question';
    }
    return 'booking_confirmation';
  }

  // Availability checks
  if (intent === INTENTS.CHECK_AVAILABILITY) {
    if (context.is_today || context.is_tomorrow) {
      return 'no_availability_today';
    }
    if (context.day_preference !== null || context.time_preference !== 'any') {
      return 'filtered_search';
    }
    if (context.is_specific_date) {
      return 'availability_list';
    }
    if (context.is_flexible) {
      return 'general_search';
    }
    return 'general_search';
  }

  // Handle unknown with preferences
  if (intent === INTENTS.UNKNOWN && (context.day_preference !== null || context.time_preference !== 'any')) {
    return 'filtered_search';
  }

  // Default
  return 'fallback';
}

// ============================================================================
// AI RESPONSE GENERATION
// ============================================================================

function generateAIResponse(
  intent: string,
  entities: AIAgentEntities,
  context: AvailabilityContext,
  responseType: SuggestedResponseType,
  userProfile?: { is_first_time: boolean; booking_count: number }
): { readonly aiResponse: string; readonly needsMoreInfo: boolean; readonly followUpQuestion: string | null } {
  let aiResponse = '';
  let needsMoreInfo = false;
  let followUpQuestion: string | null = null;

  switch (responseType) {
    case 'urgent_options':
      aiResponse = `🚨 Entiendo que es **urgente**. Veo las opciones disponibles:\n\n1️⃣ **Lista de espera prioritaria**: Te aviso si se libera algo en las próximas 24hs (60% de éxito)\n2️⃣ **Primera hora mañana**: Suelo tener disponibilidad a las 07:30\n3️⃣ **Consulta express**: 15min si es solo una consulta rápida\n\n¿Cuál opción prefieres? (1-3)\n\n📞 Para urgencias reales, también puedes llamar al +54 11 1234-5678`;
      break;

    case 'greeting_response':
      if (userProfile?.is_first_time) {
        aiResponse = `👋 ¡Hola! ¡Bienvenido por primera vez! Soy tu asistente virtual de reservas. Estoy aquí para ayudarte a agendar, cancelar o reprogramar tus citas.\n\n¿En qué puedo ayudarte hoy?\n\n📌 **Opciones rápidas**:\n- "Quiero agendar una cita"\n- "¿Tienen disponibilidad para hoy?"\n- "Necesito cancelar mi reserva"`;
      } else if (userProfile && !userProfile.is_first_time && userProfile.booking_count > 0) {
        aiResponse = `👋 ¡Hola! ¡qué bueno verte de nuevo! Soy tu asistente virtual de reservas. Estoy aquí para ayudarte a agendar, cancelar o reprogramar tus citas.\n\n¿En qué puedo ayudarte hoy?\n\n📌 **Opciones rápidas**:\n- "Quiero agendar una cita"\n- "¿Tienen disponibilidad para hoy?"\n- "Necesito cancelar mi reserva"`;
      } else {
        aiResponse = `👋 ¡Hola! ¡Bienvenido! Soy tu asistente virtual de reservas. Estoy aquí para ayudarte a agendar, cancelar o reprogramar tus citas.\n\n¿En qué puedo ayudarte hoy?\n\n📌 **Opciones rápidas**:\n- "Quiero agendar una cita"\n- "¿Tienen disponibilidad para hoy?"\n- "Necesito cancelar mi reserva"`;
      }
      break;

    case 'no_availability_today':
      aiResponse = `😅 Lo siento, pero **hoy** estamos completamente reservados.\n\n📅 Pero tengo buenas noticias:\n\n✅ **Mañana** tengo estas horas disponibles:\n   🕙 09:00 - Disponible\n   🕚 11:00 - Disponible\n   🕐 14:00 - Disponible\n\n¿Te gustaría reservar para mañana?`;
      break;

    case 'availability_list':
      aiResponse = `📅 Déjame verificar la disponibilidad${entities.date ? ` para ${entities.date}` : ''}...\n\n✨ Un momento, estoy consultando la agenda...`;
      break;

    case 'booking_confirmation':
      aiResponse = `✅ ¡Claro! Puedo ayudarte a agendar una cita.\n\n📋 **Detalles**:\n${entities.date ? `- 📅 Fecha: ${entities.date}` : '- 📅 Fecha: Por definir'}\n${entities.time ? `- 🕐 Hora: ${entities.time}` : '- 🕐 Hora: Por definir'}\n${entities.service_type ? `- 🏥 Servicio: ${entities.service_type}` : '- 🏥 Servicio: Por definir'}\n${entities.provider_name ? `- 👨‍⚕️ Profesional: ${entities.provider_name}` : '- 👨‍⚕️ Profesional: Por definir'}\n\n¿Confirmas estos detalles para reservar?`;
      break;

    case 'cancellation_flow':
      aiResponse = `❌ Entiendo que necesitas cancelar una cita.\n\nPor favor proporcióname:\n- 📋 El ID de tu reserva, o\n- 📅 La fecha y hora de la cita\n\n¿Puedes darme esa información?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Cuál es el ID de tu reserva o la fecha de la cita?';
      break;

    case 'reschedule_flow':
      aiResponse = `🔄 Quieres reprogramar tu cita. ¡Entendido!\n\nNecesito saber:\n1️⃣ El ID de tu reserva actual (o fecha/hora)\n2️⃣ ¿Para cuándo te gustaría cambiar?\n\n¿Me puedes dar esa información?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Cuál es tu reserva actual y cuándo te gustaría cambiar?';
      break;

    case 'clarifying_question':
      aiResponse = `🤔 Para ayudarte mejor, necesito un poco más de información:\n\n¿Qué tipo de servicio estás buscando?\n- 🦷 **Consulta general**\n- 🦷 **Limpieza dental**\n- 🦷 **Otro tratamiento**\n\n¿Y tienes preferencia de día u horario?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué servicio necesitas y cuándo prefieres?';
      break;

    case 'general_search':
      aiResponse = `📅 Te ayudo a buscar disponibilidad.\n\n${context.is_flexible ? '✨ ¡Veo que eres flexible, eso es bueno! ' : ''}¿Tienes alguna preferencia de:\n- 📅 **Día de la semana**?\n- 🕐 **Horario** (mañana, tarde)?\n- 📆 **Esta semana o la próxima**?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué día u horario prefieres?';
      break;

    case 'filtered_search':
      aiResponse = `📅 ¡Entendido! Busco disponibilidad${context.day_preference ? ` los ${context.day_preference}` : ''}${context.time_preference !== 'any' ? ` por la ${context.time_preference}` : ''}.\n\nDéjame consultar la agenda con esos filtros...`;
      break;

    default:
      aiResponse = `🤔 No estoy seguro de entender completamente.\n\nPuedo ayudarte con:\n- 📅 Agendar una cita\n- ❌ Cancelar una reserva\n- 🔄 Reprogramar una cita\n- 📋 Ver disponibilidad\n\n¿Podrías ser más específico? Ej: *"Quiero reservar una cita para mañana a las 3pm"*`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué tipo de ayuda necesitas?';
      break;
  }

  return { aiResponse, needsMoreInfo, followUpQuestion };
}

// ============================================================================
// INTENT DETECTION (HELPER FUNCTIONS)
// ============================================================================

function detectGreetingOrFarewell(text: string): { intent: string; confidence: number } | null {
  const lower = text.toLowerCase().trim();
  const stripped = lower.replace(/[¿?¡!,.]/g, '').trim();
  const words = stripped.split(/\s+/);

  const GREETINGS = ['hola', 'holaa', 'ola'];
  const GREETING_PHRASES = ['buenos días', 'buenas tardes', 'buenas noches', 'buen día', 'qué tal'];
  const FAREWELLS = ['chau', 'chao', 'adiós', 'adios'];
  const FAREWELL_PHRASES = ['hasta luego', 'nos vemos', 'hasta pronto'];

  if (FAREWELLS.includes(stripped) || FAREWELL_PHRASES.some(p => lower.includes(p))) {
    return { intent: INTENTS.FAREWELL, confidence: 0.9 };
  }

  // Fast-track greetings, but only if they are the sole intent (e.g. short message)
  if (GREETINGS.includes(words[0]) || GREETING_PHRASES.some(p => lower.startsWith(p))) {
    if (words.length <= 4 || GREETINGS.includes(stripped)) {
      return { intent: INTENTS.GREETING, confidence: 0.9 };
    }
  }
  if (stripped === 'saludos') {
    return { intent: INTENTS.GREETING, confidence: 0.9 };
  }

  if ((lower.includes('gracias') || lower.includes('agradezco')) && words.length <= 4) {
    return { intent: INTENTS.THANK_YOU, confidence: 0.9 };
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

  if (lowerKeyword.includes(' ')) {
    return lowerText.includes(lowerKeyword);
  }

  const wordBoundary = new RegExp(`\\b${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (wordBoundary.test(lowerText)) return true;

  if (lowerKeyword.length < 5) return false;

  const maxDistance = lowerKeyword.length <= 9 ? 1 : lowerKeyword.length <= 12 ? 2 : 3;
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (word.length < 5) continue;
    if (Math.abs(word.length - lowerKeyword.length) > maxDistance) continue;
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
  if (isOffTopic(text)) return { intent: INTENTS.GENERAL_QUESTION, confidence: 0.8 };

  const normalizedText = normalizeText(text);

  const greeting = detectGreetingOrFarewell(normalizedText);
  if (greeting) return greeting;

  let bestIntent = INTENTS.UNKNOWN;
  let maxScore = 0;

  const lowerNorm = normalizedText.toLowerCase();
  if (/\breagendar\b/.test(lowerNorm)) {
    return { intent: INTENTS.RESCHEDULE, confidence: 1.0 };
  }

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (fuzzyMatch(normalizedText, keyword)) {
        score += config.weight;
      }
    }
    if (score > maxScore) { maxScore = score; bestIntent = intent; }
  }

  if (bestIntent === INTENTS.URGENT_CARE) {
    const urgencyWords = ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'];
    const hasRealUrgency = urgencyWords.some(w => lowerNorm.includes(w));
    if (!hasRealUrgency) {
      maxScore = 0;
      bestIntent = INTENTS.UNKNOWN;
      for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
        if (intent === INTENTS.URGENT_CARE) continue;
        let score = 0;
        for (const keyword of config.keywords) {
          if (fuzzyMatch(normalizedText, keyword)) score += config.weight;
        }
        if (score > maxScore) { maxScore = score; bestIntent = intent; }
      }
    }
  }

  const confidence = maxScore > 0 ? Math.min(1.0, maxScore / (CONFIDENCE_THRESHOLDS[bestIntent] ?? 0.3) / 3) : 0.1;
  return { intent: bestIntent, confidence };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: unknown | null; readonly error_message: string | null; readonly error_code?: string }> {
  try {
    const inputSchema = z.object({ 
      chat_id: z.string().min(1), 
      text: z.string().trim().min(1),
      user_profile: z.object({
        is_first_time: z.boolean(),
        booking_count: z.number()
      }).optional()
    });
    const input = inputSchema.safeParse(rawInput);
    if (!input.success) {
      return { success: false, data: null, error_code: 'VALIDATION_ERROR', error_message: `Invalid input: ${input.error.message}` };
    }

    const intentResult = detectIntent(input.data.text);
    const intent = intentResult.intent;
    const confidence = intentResult.confidence;

    // Extract entities
    const entities = extractEntities(input.data.text);

    // Detect context
    const context = detectContext(input.data.text, entities);

    // Suggest response type
    const suggested_response_type = suggestResponseType(intent, context, entities);

    // Generate AI response
    const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(intent, entities, context, suggested_response_type, input.data.user_profile);

    return {
      success: true,
      data: {
        intent,
        confidence,
        chat_id: input.data.chat_id,
        entities,
        context,
        suggested_response_type,
        ai_response: aiResponse,
        needs_more_info: needsMoreInfo,
        follow_up_question: followUpQuestion,
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

export type { AIAgentEntities, AvailabilityContext, SuggestedResponseType };
export { INTENTS, CONFIDENCE_THRESHOLDS, NORMALIZATION_MAP, normalizeText, detectIntent, levenshtein, fuzzyMatch, extractEntities, detectContext, suggestResponseType, generateAIResponse };
