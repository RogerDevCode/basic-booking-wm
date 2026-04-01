// AI Agent v2.0 - Enhanced with Availability Context
// Detecta intención del usuario, urgencia, contexto y sugiere tipo de respuesta
// Equivalente mejorado de NN_03_AI_Agent

export interface AIAgentInput {
  chat_id: string;
  text: string;
  user_profile?: {
    is_first_time?: boolean;
    last_service?: string;
    booking_count?: number;
  };
}

export interface AIAgentEntities {
  provider_id?: string;
  service_id?: string;
  start_time?: string;
  date?: string;
  time?: string;
  date_range?: string; // "hoy", "mañana", "próxima semana", "este mes"
}

// NUEVO: Contexto para respuestas de disponibilidad
export interface AvailabilityContext {
  is_today: boolean;
  is_tomorrow: boolean;
  is_urgent: boolean;
  is_flexible: boolean;
  is_specific_date: boolean;
  time_preference: 'morning' | 'afternoon' | 'evening' | 'any';
  day_preference?: string; // "monday", "tuesday", etc.
}

// NUEVO: Tipo de respuesta sugerida
export type SuggestedResponseType =
  | 'availability_list'           // Hay disponibilidad, mostrar lista
  | 'no_availability_today'       // No hay hoy, sugerir mañana
  | 'no_availability_extended'    // No hay en 7+ días, lista de espera
  | 'urgent_options'              // Urgencia, mostrar opciones prioritarias
  | 'general_search'              // Búsqueda general sin fecha específica
  | 'filtered_search'             // Búsqueda con filtros (día/horario)
  | 'booking_confirmation'        // Confirmar detalles de reserva
  | 'cancellation_flow'           // Flujo de cancelación
  | 'reschedule_flow'             // Flujo de reagendamiento
  | 'clarifying_question'         // Necesita más información
  | 'greeting_response'           // Saludo
  | 'fallback';                   // Respuesta genérica

export interface AIAgentData {
  intent: string;
  chat_id: string;
  entities: AIAgentEntities;
  confidence: number;
  context: AvailabilityContext;  // NUEVO
  suggested_response_type: SuggestedResponseType;  // NUEVO
  ai_response?: string;
  needs_more_info?: boolean;  // NUEVO
  follow_up_question?: string;  // NUEVO
}

export interface AIAgentResponse {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  data: AIAgentData | null;
  _meta: {
    source: string;
    timestamp: string;
    workflow_id: string;
    version: string;
  };
}

// Intent types
const INTENTS = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE_APPOINTMENT: 'reschedule_appointment',
  CHECK_AVAILABILITY: 'check_availability',
  LIST_PROVIDERS: 'list_providers',
  LIST_SERVICES: 'list_services',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  URGENT_CARE: 'urgent_care',  // NUEVO
  UNKNOWN: 'unknown'
};

// Keywords for intent detection (enhanced)
const INTENT_KEYWORDS: Record<string, string[]> = {
  [INTENTS.CREATE_APPOINTMENT]: ['reservar', 'agendar', 'citar', 'crear', 'nueva', 'nuevo', 'quiero', 'deseo', 'para', 'turno'],
  [INTENTS.CANCEL_APPOINTMENT]: ['cancelar', 'anular', 'eliminar', 'borrar'],
  [INTENTS.RESCHEDULE_APPOINTMENT]: ['reprogramar', 'cambiar', 'mover', 'trasladar', 'pasar'],
  [INTENTS.CHECK_AVAILABILITY]: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tiene', 'tienen'],
  [INTENTS.LIST_PROVIDERS]: ['proveedores', 'profesionales', 'doctores', 'médicos', 'doctor', 'doctora'],
  [INTENTS.LIST_SERVICES]: ['servicios', 'tratamientos', 'procedimientos', 'consulta'],
  [INTENTS.GREETING]: ['hola', 'buenos', 'buenas', 'saludos', 'qué tal', 'que tal'],
  [INTENTS.FAREWELL]: ['adiós', 'chao', 'chau', 'hasta', 'nos vemos'],
  [INTENTS.THANK_YOU]: ['gracias', 'agradezco', 'thank'],
  [INTENTS.URGENT_CARE]: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'urgencia']  // NUEVO
};

// Palabras clave para detectar urgencia
const URGENCY_KEYWORDS = ['urgente', 'emergencia', 'urgencia', 'ya', 'inmediato', 'dolor', 'molesto', 'rápido', 'pronto', 'antes'];

// Palabras clave para detectar flexibilidad
const FLEXIBILITY_KEYWORDS = ['cualquier', 'lo que', 'lo que tengas', 'indistinto', 'cualquiera', 'primero', 'mejor', 'conviene'];

// Preferencias horarias
const TIME_PREFERENCES: Record<string, string[]> = {
  'morning': ['mañana', 'antes', 'temprano', '8', '9', '10', '11'],
  'afternoon': ['tarde', 'después', '14', '15', '16', '17', '18'],
  'evening': ['noche', 'tarde', '19', '20', '21', '22']
};

// Días de la semana
const DAY_NAMES: Record<string, string> = {
  'lunes': 'monday',
  'martes': 'tuesday',
  'miércoles': 'wednesday',
  'miercoles': 'wednesday',
  'jueves': 'thursday',
  'viernes': 'friday',
  'sábado': 'saturday',
  'sabado': 'saturday',
  'domingo': 'sunday'
};

// Fechas relativas
const RELATIVE_DATES: Record<string, string> = {
  'hoy': 'today',
  'mañana': 'tomorrow',
  'manana': 'tomorrow',
  'pasado mañana': 'day_after_tomorrow',
  'pasado manana': 'day_after_tomorrow',
  'esta semana': 'this_week',
  'próxima semana': 'next_week',
  'proxima semana': 'next_week',
  'este mes': 'this_month',
  'próximo mes': 'next_month'
};

export async function main(input: AIAgentInput): Promise<AIAgentResponse> {
  const source = "NN_03_AI_Agent_v2";
  const workflowID = "ai-agent-v2";
  const version = "2.0.0";

  const { chat_id, text, user_profile } = input;

  // Validate input
  if (!chat_id || !text || text.trim().length === 0) {
    return {
      success: false,
      error_code: 'VALIDATION_ERROR',
      error_message: 'chat_id and text are required',
      data: null,
      _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
    };
  }

  const textLower = text.toLowerCase().trim();

  // === 1. INTENT DETECTION (Enhanced with scoring) ===
  const { detectedIntent, confidence } = detectIntent(textLower);

  // === 2. ENTITY EXTRACTION (Enhanced) ===
  const entities = extractEntities(textLower);

  // === 3. CONTEXT DETECTION (NEW) ===
  const context = detectContext(textLower, entities);

  // === 4. SUGGESTED RESPONSE TYPE (NEW) ===
  const suggestedResponseType = suggestResponseType(detectedIntent, context, entities);

  // === 5. GENERATE AI RESPONSE (Enhanced) ===
  const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(
    detectedIntent,
    entities,
    context,
    suggestedResponseType,
    user_profile
  );

  return {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      intent: detectedIntent,
      chat_id,
      entities,
      confidence,
      context,  // NEW
      suggested_response_type: suggestedResponseType,  // NEW
      ai_response: aiResponse,
      needs_more_info: needsMoreInfo,  // NEW
      follow_up_question: followUpQuestion  // NEW
    },
    _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function detectIntent(text: string): { detectedIntent: string; confidence: number } {
  let detectedIntent = INTENTS.UNKNOWN;
  let maxScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedIntent = intent;
    }
  }

  // Detectar urgencia como intent prioritario
  const urgencyScore = URGENCY_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (urgencyScore >= 2 || (urgencyScore >= 1 && (detectedIntent === INTENTS.CREATE_APPOINTMENT || detectedIntent === INTENTS.CHECK_AVAILABILITY))) {
    detectedIntent = INTENTS.URGENT_CARE;
    maxScore = Math.max(maxScore, urgencyScore);
  }

  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1) : 0.3;

  return { detectedIntent, confidence };
}

function extractEntities(text: string): AIAgentEntities {
  const entities: AIAgentEntities = {};

  // Extract provider_id
  const providerMatch = text.match(/proveedor\s*(\d+)/i) || text.match(/(\d+)\s*(proveedor)/i);
  if (providerMatch) {
    entities.provider_id = providerMatch[1];
  }

  // Extract service_id
  const serviceMatch = text.match(/servicio\s*(\d+)/i) || text.match(/(\d+)\s*(servicio)/i);
  if (serviceMatch) {
    entities.service_id = serviceMatch[1];
  }

  // Extract date (enhanced with relative dates)
  const datePatterns = [
    /((?:\d{1,2}[/\-]){2}\d{2,4})/,  // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4}(?:[/\-]\d{1,2}){2})/,     // YYYY-MM-DD
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.date = match[1];
      break;
    }
  }

  // Extract relative dates (hoy, mañana, etc.)
  for (const [relative, value] of Object.entries(RELATIVE_DATES)) {
    if (text.includes(relative)) {
      entities.date_range = relative;
      if (!entities.date) {
        entities.date = relative;
      }
      break;
    }
  }

  // Extract time (enhanced)
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm|hrs|horas)?)/i,
    /(\d{1,2}\s*(am|pm|hrs|horas))/i,
    /las\s*(\d{1,2})\s*(am|pm|horas)?/i
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.time = match[1];
      entities.start_time = match[1];
      break;
    }
  }

  return entities;
}

function detectContext(text: string, entities: AIAgentEntities): AvailabilityContext {
  const context: AvailabilityContext = {
    is_today: false,
    is_tomorrow: false,
    is_urgent: false,
    is_flexible: false,
    is_specific_date: false,
    time_preference: 'any'
  };

  // Detect is_today
  if (text.includes('hoy') || entities.date === 'hoy' || entities.date_range === 'hoy') {
    context.is_today = true;
    context.is_specific_date = true;
  }

  // Detect is_tomorrow
  if (text.includes('mañana') || text.includes('manana') || entities.date === 'mañana' || entities.date_range === 'tomorrow') {
    context.is_tomorrow = true;
    context.is_specific_date = true;
  }

  // Detect is_urgent
  const urgencyScore = URGENCY_KEYWORDS.filter(kw => text.includes(kw)).length;
  context.is_urgent = urgencyScore >= 1;

  // Detect is_flexible
  const flexibilityScore = FLEXIBILITY_KEYWORDS.filter(kw => text.includes(kw)).length;
  context.is_flexible = flexibilityScore >= 1;

  // Detect time_preference
  for (const [pref, keywords] of Object.entries(TIME_PREFERENCES)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score >= 1) {
      context.time_preference = pref as 'morning' | 'afternoon' | 'evening' | 'any';
      break;
    }
  }

  // Detect day_preference
  for (const [dayName, dayValue] of Object.entries(DAY_NAMES)) {
    if (text.includes(dayName)) {
      context.day_preference = dayValue;
      context.is_specific_date = true;
      break;
    }
  }

  // Detect specific date mention
  if (entities.date && !['hoy', 'mañana', 'manana'].includes(entities.date)) {
    context.is_specific_date = true;
  }

  return context;
}

function suggestResponseType(
  intent: string,
  context: AvailabilityContext,
  entities: AIAgentEntities
): SuggestedResponseType {
  // Urgency first
  if (context.is_urgent || intent === INTENTS.URGENT_CARE) {
    return 'urgent_options';
  }

  // Greeting/farewell
  if (intent === INTENTS.GREETING) return 'greeting_response';
  if (intent === INTENTS.FAREWELL) return 'fallback';
  if (intent === INTENTS.THANK_YOU) return 'fallback';

  // Booking flows
  if (intent === INTENTS.CREATE_APPOINTMENT) {
    if (!entities.date && !entities.time) {
      return 'clarifying_question';
    }
    return 'booking_confirmation';
  }

  if (intent === INTENTS.CANCEL_APPOINTMENT) return 'cancellation_flow';
  if (intent === INTENTS.RESCHEDULE_APPOINTMENT) return 'reschedule_flow';

  // Availability checks
  if (intent === INTENTS.CHECK_AVAILABILITY) {
    if (context.is_today) {
      return 'no_availability_today'; // Asumir el peor caso, el sistema ajustará
    }
    if (context.is_specific_date) {
      return 'availability_list';
    }
    if (context.is_flexible) {
      return 'general_search';
    }
    if (context.day_preference || context.time_preference !== 'any') {
      return 'filtered_search';
    }
    return 'general_search';
  }

  return 'fallback';
}

function generateAIResponse(
  intent: string,
  entities: AIAgentEntities,
  context: AvailabilityContext,
  responseType: SuggestedResponseType,
  user_profile?: { is_first_time?: boolean; last_service?: string; booking_count?: number }
): { aiResponse: string; needsMoreInfo: boolean; followUpQuestion?: string } {
  let aiResponse: string;
  let needsMoreInfo = false;
  let followUpQuestion: string | undefined;

  const isFirstTime = user_profile?.is_first_time ?? true;
  const bookingCount = user_profile?.booking_count ?? 0;

  switch (responseType) {
    case 'urgent_options': {
      aiResponse = `🚨 Entiendo que es **urgente**. Veo las opciones disponibles:
      
1️⃣ **Lista de espera prioritaria**: Te aviso si se libera algo en las próximas 24hs (60% de éxito)
2️⃣ **Primera hora mañana**: Suelo tener disponibilidad a las 07:30
3️⃣ **Consulta express**: 15min si es solo una consulta rápida

¿Cuál opción prefieres? (1-3)

📞 Para urgencias reales, también puedes llamar al +54 11 1234-5678`;
      break;
    }

    case 'availability_list': {
      aiResponse = `📅 Déjame verificar la disponibilidad${entities.date ? ` para ${entities.date}` : ''}...
      
✨ Un momento, estoy consultando la agenda...`;
      break;
    }

    case 'no_availability_today': {
      aiResponse = `😅 Lo siento, pero **hoy** estamos completamente reservados.

📅 Pero tengo buenas noticias:

✅ **Mañana** tengo estas horas disponibles:
   🕙 09:00 - Disponible
   🕚 11:00 - Disponible
   🕐 14:00 - Disponible

¿Te gustaría reservar para mañana?`;
      break;
    }

    case 'no_availability_extended': {
      aiResponse = `😓 Lo siento, estamos completamente reservados por los próximos 7 días.

📋 Opciones que te puedo ofrecer:

1️⃣ **Lista de Espera**: Te aviso si alguien cancela
2️⃣ **Próxima disponibilidad**: Semana del 7 de abril
3️⃣ **Horarios con más disponibilidad**: Martes y miércoles temprano

¿Cuál opción prefieres? (1-3)`;
      break;
    }

    case 'general_search': {
      aiResponse = `📅 Te ayudo a buscar disponibilidad. 

${context.is_flexible ? 'Veo que eres flexible, eso es bueno! ' : ''}¿Tienes alguna preferencia de:
- 📅 Día de la semana?
- 🕐 Horario (mañana, tarde)?
- 📆 Esta semana o la próxima?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué día u horario prefieres?';
      break;
    }

    case 'filtered_search': {
      aiResponse = `📅 Entendido! Buscas disponibilidad${context.day_preference ? ` los ${context.day_preference}` : ''}${context.time_preference === 'any' ? '' : ` por la ${context.time_preference}`}.
      
Déjame consultar la agenda con esos filtros...`;
      break;
    }

    case 'booking_confirmation': {
      aiResponse = `✅ ¡Claro! Puedo ayudarte a agendar una cita.
      
📋 **Detalles:**
${entities.date ? `- 📅 Fecha: ${entities.date}` : '- 📅 Fecha: Por definir'}
${entities.time ? `- 🕐 Hora: ${entities.time}` : '- 🕐 Hora: Por definir'}
${entities.service_id ? `- 🏥 Servicio: ${entities.service_id}` : '- 🏥 Servicio: Por definir'}

${isFirstTime ? '👋 Veo que es tu primera vez! ' : ''}${bookingCount > 5 ? '🌟 Gracias por tu confianza! ' : ''}¿Confirmas estos detalles para reservar?`;
      break;
    }

    case 'cancellation_flow': {
      aiResponse = `❌ Entiendo que necesitas cancelar una cita.
      
Por favor proporcióname:
- 📋 El ID de tu reserva, o
- 📅 La fecha y hora de la cita

¿Puedes darme esa información?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Cuál es el ID de tu reserva o la fecha de la cita?';
      break;
    }

    case 'reschedule_flow': {
      aiResponse = `🔄 Quieres reprogramar tu cita. Entendido!
      
Necesito saber:
1️⃣ El ID de tu reserva actual (o fecha/hora)
2️⃣ ¿Para cuándo te gustaría cambiar?

¿Me puedes dar esa información?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Cuál es tu reserva actual y cuándo te gustaría cambiar?';
      break;
    }

    case 'clarifying_question': {
      aiResponse = `🤔 Para ayudarte mejor, necesito un poco más de información:

¿Qué tipo de servicio estás buscando?
- 🦷 Consulta general
- 🦷 Limpieza dental
- 🦷 Otro tratamiento

¿Y tienes preferencia de día u horario?`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué servicio necesitas y cuándo prefieres?';
      break;
    }

    case 'greeting_response': {
      aiResponse = `👋 ¡Hola! ${isFirstTime ? '¡Bienvenido! ' : '¡Qué bueno verte de nuevo! '}

Soy tu asistente virtual de reservas. Estoy aquí para ayudarte a agendar, cancelar o reprogramar tus citas.

¿En qué puedo ayudarte hoy?

📌 **Opciones rápidas:**
- "Quiero agendar una cita"
- "¿Tienen disponibilidad para hoy?"
- "Necesito cancelar mi reserva"`;
      break;
    }

    case 'fallback':
    default: {
      aiResponse = `🤔 No estoy seguro de entender completamente. 

Puedo ayudarte con:
- 📅 Agendar una cita
- ❌ Cancelar una reserva
- 🔄 Reprogramar una cita
- 📋 Ver disponibilidad

¿Podrías ser más específico? Ej: *"Quiero reservar una cita para mañana a las 3pm"*`;
      needsMoreInfo = true;
      followUpQuestion = '¿Qué tipo de ayuda necesitas?';
      break;
    }
  }

  return { aiResponse, needsMoreInfo, followUpQuestion };
}
