import { z } from "zod";
import "@total-typescript/ts-reset";

// ============================================================================
// STRICT STATIC TYPING DEFINITIONS (SSOT Compliant)
// ============================================================================

export const AIAgentInputSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().trim().min(1),
  user_profile: z.object({
    is_first_time: z.boolean().nullish().transform(v => v ?? null),
    last_service: z.string().nullish().transform(v => v ?? null),
    booking_count: z.number().int().min(0).nullish().transform(v => v ?? null)
  }).nullish().transform(v => v ?? null),
  conversation_history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string()
  })).nullish().transform(v => v ?? null)
}).strict();

export type AIAgentInput = z.infer<typeof AIAgentInputSchema>;

export interface AIAgentEntities {
  readonly provider_id: string | null;
  readonly service_id: string | null;
  readonly start_time: string | null;
  readonly date: string | null;
  readonly time: string | null;
  readonly date_range: string | null;
}

export interface AvailabilityContext {
  readonly is_today: boolean;
  readonly is_tomorrow: boolean;
  readonly is_urgent: boolean;
  readonly is_flexible: boolean;
  readonly is_specific_date: boolean;
  readonly time_preference: 'morning' | 'afternoon' | 'evening' | 'any';
  readonly day_preference: string | null;
}

export type SuggestedResponseType =
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

export interface AIAgentData {
  readonly intent: string;
  readonly chat_id: string;
  readonly entities: AIAgentEntities;
  readonly confidence: number;
  readonly context: AvailabilityContext;
  readonly suggested_response_type: SuggestedResponseType;
  readonly ai_response: string;
  readonly needs_more_info: boolean;
  readonly follow_up_question: string | null;
  readonly cot_reasoning: string;
  readonly validation_passed: boolean;
  readonly validation_errors: readonly string[];
}

export interface AIAgentResponse {
  readonly success: boolean;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly data: AIAgentData | null;
  readonly _meta: {
    readonly source: string;
    readonly timestamp: string;
    readonly workflow_id: string;
    readonly version: string;
  };
}

interface ValidationResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
}

// ============================================================================
// FEW-SHOT EXAMPLES (10 por intent - Research-based)
// ============================================================================

const FEW_SHOT_EXAMPLES: Record<string, readonly string[]> = {
  create_appointment: [
    "Quiero agendar una cita para mañana",
    "Necesito reservar con el Dr. García",
    "¿Tienen hora el lunes?",
    "Me gustaría crear una nueva cita",
    "Quiero un turno para la próxima semana",
    "Necesito agendar una consulta general",
    "¿Puedo reservar para el viernes?",
    "Quiero sacar un turno",
    "Necesito una cita médica",
    "Quiero programar una visita"
  ],
  cancel_appointment: [
    "Necesito cancelar mi cita",
    "Ya no puedo asistir, quiero anular",
    "Por favor eliminen mi reserva",
    "Quiero borrar mi cita",
    "Necesito anular el turno que saqué",
    "Quiero cancelar la reserva que hice",
    "Por favor cancelen mi cita del lunes",
    "Necesito eliminar mi turno",
    "Quiero dar de baja mi cita",
    "No puedo ir, quiero cancelar"
  ],
  reschedule_appointment: [
    "Necesito reprogramar mi cita",
    "Quiero cambiar mi cita para otro día",
    "¿Puedo mover mi reserva?",
    "Necesito pasar mi cita para la semana que viene",
    "Quiero trasladar mi turno",
    "¿Se puede cambiar la hora de mi cita?",
    "Necesito reagendar mi cita",
    "Quiero modificar la fecha de mi reserva",
    "¿Puedo pasar mi turno para otro día?",
    "Necesito cambiar el horario de mi cita"
  ],
  check_availability: [
    "¿Qué horas tienen disponibles?",
    "¿Tienen disponibilidad para mañana?",
    "¿Qué días tienen libre?",
    "¿Me pueden decir si tienen hora?",
    "¿Hay disponibilidad esta semana?",
    "¿Qué horarios tienen?",
    "¿Tienen turno disponible?",
    "¿Me dicen si tienen lugar?",
    "¿Qué días están disponibles?",
    "¿Tienen huecos libres?"
  ],
  urgent_care: [
    "¡Es urgente, necesito atención ya!",
    "Tengo una emergencia médica",
    "¡Necesito una cita urgente!",
    "Es muy urgente, tengo mucho dolor",
    "¡Necesito que me atiendan ahora mismo!",
    "Urgencia, necesito ayuda inmediata",
    "¡Es una emergencia, por favor!",
    "Necesito atención urgente, es importante",
    "¡Urgente, no puedo esperar!",
    "Emergencia médica, necesito cita ya"
  ],
  greeting: [
    "Hola, buenos días",
    "Buenas tardes, ¿cómo están?",
    "Hola, ¿qué tal?",
    "Buenos días, saludos",
    "Hola, ¿cómo les va?",
    "Buenas, ¿qué tal todo?",
    "Hola, buenos días tenga",
    "Saludos, ¿cómo están?",
    "Hola, ¿me pueden ayudar?",
    "Buenas tardes, saludos cordiales"
  ]
};

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  urgent_care: 0.5,
  cancel_appointment: 0.3,
  reschedule_appointment: 0.3,
  check_availability: 0.0,
  create_appointment: 0.3,
  greeting: 0.5,
  farewell: 0.5,
  thank_you: 0.5,
};

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
  URGENT_CARE: 'urgent_care',
  UNKNOWN: 'unknown'
} as const;

const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENTS.URGENT_CARE]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor'],
    weight: 5
  },
  [INTENTS.CANCEL_APPOINTMENT]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar'],
    weight: 3
  },
  [INTENTS.RESCHEDULE_APPOINTMENT]: {
    keywords: ['reprogramar', 'cambiar', 'mover', 'trasladar', 'pasar'],
    weight: 3
  },
  [INTENTS.CHECK_AVAILABILITY]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tiene', 'tienen', 'hora', 'busco'],
    weight: 2
  },
  [INTENTS.CREATE_APPOINTMENT]: {
    keywords: ['reservar', 'agendar', 'citar', 'crear', 'nueva', 'nuevo', 'turno', 'hora', 'busco'],
    weight: 1
  },
  [INTENTS.GREETING]: {
    keywords: ['hola', 'buenos', 'buenas', 'saludos', 'qué tal', 'que tal'],
    weight: 1
  },
  [INTENTS.FAREWELL]: {
    keywords: ['adiós', 'chao', 'chau', 'hasta', 'nos vemos'],
    weight: 1
  },
  [INTENTS.THANK_YOU]: {
    keywords: ['gracias', 'agradezco', 'thank'],
    weight: 1
  },
};

const URGENCY_KEYWORDS = ['urgente', 'emergencia', 'urgencia', 'ya', 'inmediato', 'dolor', 'molesto', 'rápido', 'pronto', 'antes'];

const FLEXIBILITY_KEYWORDS = [
  'cualquier',
  'lo que tengas',
  'lo que conviene',
  'indistinto',
  'flexible',
  'cualquiera',
  'lo que esté',
  'lo que haya',
  'primero que',
  'mejor que'
];

const TIME_PREFERENCES: Record<string, readonly string[]> = {
  'morning': ['mañana', 'antes', 'temprano'],
  'afternoon': ['tarde', 'después'],
  'evening': ['noche', 'tarde'] // tarde can be evening or afternoon
};

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

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function main(rawInput: unknown): Promise<AIAgentResponse> {
  const source = "NN_03_AI_Agent_v2.3_SSOT";
  const workflowID = "ai-agent-v2.3";
  const version = "2.3.0";

  // Parse boundary validation
  const parseResult = AIAgentInputSchema.safeParse(rawInput);
  
  if (!parseResult.success) {
    return {
      success: false,
      error_code: 'VALIDATION_ERROR',
      error_message: `Invalid input: ${parseResult.error.message}`,
      data: null,
      _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
    };
  }

  const input = parseResult.data;
  const textLower = input.text.toLowerCase().trim();

  // 1. CoT Reasoning (Before)
  const cotBefore = generateCotBefore(textLower);

  // 2. Intent Detection
  const { detectedIntent, confidence, cotAfter } = detectIntentWithFewShot(textLower);

  // 3. Entity Extraction
  const entities = extractEntities(textLower);

  // 4. Context Detection
  const context = detectContext(textLower, entities);

  // 5. Validation
  const validation = validateIntentResult(detectedIntent, confidence, context, entities);

  // 6. Response Suggestion
  const suggestedType = suggestResponseType(detectedIntent, context, entities);

  // 7. Generation
  const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(
    detectedIntent,
    entities,
    context,
    suggestedType,
    input.user_profile,
    validation
  );

  const agentData: AIAgentData = {
    intent: detectedIntent,
    chat_id: input.chat_id,
    entities,
    confidence,
    context,
    suggested_response_type: suggestedType,
    ai_response: aiResponse,
    needs_more_info: needsMoreInfo,
    follow_up_question: followUpQuestion,
    cot_reasoning: `${cotBefore}\n\n${cotAfter}`,
    validation_passed: validation.passed,
    validation_errors: validation.errors
  };

  return {
    success: true,
    error_code: null,
    error_message: null,
    data: agentData,
    _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
  };
}

// ============================================================================
// CORE LOGIC FUNCTIONS
// ============================================================================

function generateCotBefore(text: string): string {
  const keywords = text.split(' ').filter(w => w.length > 3);
  const urgency = URGENCY_KEYWORDS.some(kw => text.includes(kw)) ? 'SÍ' : 'NO';
  const flex = FLEXIBILITY_KEYWORDS.some(kw => text.includes(kw)) ? 'SÍ' : 'NO';
  
  return `=== ANÁLISIS PRELIMINAR ===
Keywords detectadas: ${keywords.slice(0, 5).join(', ')}...
Longitud del texto: ${text.length} caracteres
Contiene urgencia: ${urgency}
Contiene flexibilidad: ${flex}`;
}

function detectIntentWithFewShot(text: string): {
  readonly detectedIntent: string;
  readonly confidence: number;
  readonly cotAfter: string;
} {
  const urgencyScore = scoreKeywords(text, URGENCY_KEYWORDS);
  if (urgencyScore >= 1) {
    const conf = Math.min(1.0, urgencyScore / 2.0);
    return {
      detectedIntent: INTENTS.URGENT_CARE,
      confidence: conf,
      cotAfter: `=== CONCLUSIÓN ===\nIntent seleccionado: ${INTENTS.URGENT_CARE}\nConfianza: ${conf.toFixed(2)}\nRazón: Keywords de urgencia detectadas (peso 5)\n`
    };
  }

  let bestIntent = INTENTS.UNKNOWN as string;
  let maxWeightedScore = 0;

  const priorityOrder = [
    INTENTS.CANCEL_APPOINTMENT,
    INTENTS.RESCHEDULE_APPOINTMENT,
    INTENTS.CHECK_AVAILABILITY,
    INTENTS.CREATE_APPOINTMENT,
    INTENTS.GREETING,
    INTENTS.FAREWELL,
    INTENTS.THANK_YOU,
  ];

  for (const intent of priorityOrder) {
    const config = INTENT_KEYWORDS[intent];
    if (config === undefined) continue;
    
    const keywordScore = scoreKeywords(text, config.keywords);
    const examples = FEW_SHOT_EXAMPLES[intent] ?? [];
    const fewShotScore = calculateFewShotSimilarity(text, examples);
    
    const weightedScore = (keywordScore * config.weight) + (fewShotScore * 0.5);

    if (weightedScore > maxWeightedScore) {
      maxWeightedScore = weightedScore;
      bestIntent = intent;
    }
  }

  const confidence = maxWeightedScore > 0 ? Math.min(1.0, maxWeightedScore / 6.0) : 0.3;

  return {
    detectedIntent: bestIntent,
    confidence,
    cotAfter: `=== CONCLUSIÓN ===\nIntent seleccionado: ${bestIntent}\nConfianza: ${confidence.toFixed(2)}\nRazón: Score ponderado: ${maxWeightedScore.toFixed(2)}\n`
  };
}

function scoreKeywords(text: string, keywords: readonly string[]): number {
  let score = 0;
  for (const kw of keywords) {
    // Escape regex characters just in case, though our keywords are simple
    const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\W)${escapedKw}(?:$|\\W)`, 'i').test(text)) {
      score++;
    }
  }
  return score;
}

function calculateFewShotSimilarity(text: string, examples: readonly string[]): number {
  if (examples.length === 0) return 0;

  let maxSimilarity = 0;
  const textWords = new Set(text.split(' '));

  for (const example of examples) {
    const exampleWords = new Set(example.toLowerCase().split(' '));
    const intersection = [...textWords].filter(w => exampleWords.has(w));
    const unionSize = new Set([...textWords, ...exampleWords]).size;
    
    const jaccardSimilarity = intersection.length / unionSize;
    maxSimilarity = Math.max(maxSimilarity, jaccardSimilarity);
  }

  return maxSimilarity;
}

function extractEntities(text: string): AIAgentEntities {
  let provider_id: string | null = null;
  let service_id: string | null = null;
  let start_time: string | null = null;
  let date: string | null = null;
  let time: string | null = null;
  let date_range: string | null = null;

  const providerMatch = text.match(/proveedor\s*(\d+)/i) || text.match(/(\d+)\s*(proveedor)/i);
  if (providerMatch && providerMatch[1]) {
    provider_id = providerMatch[1];
  }

  const serviceMatch = text.match(/servicio\s*(\d+)/i) || text.match(/(\d+)\s*(servicio)/i);
  if (serviceMatch && serviceMatch[1]) {
    service_id = serviceMatch[1];
  }

  const datePatterns = [
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /(\d{1,2}[\/\-]\d{1,2})/
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      date = match[1];
      break;
    }
  }

  for (const [relative, value] of Object.entries(RELATIVE_DATES)) {
    if (text.includes(relative)) {
      date_range = value;
      if (date === null) date = relative;
      break;
    }
  }

  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm|hrs|horas)?)/i,
    /(\d{1,2}\s*(am|pm|hrs|horas))/i,
    /las\s*(\d{1,2})\s*(am|pm|horas)?/i
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      time = match[1];
      start_time = match[1];
      break;
    }
  }

  return { provider_id, service_id, start_time, date, time, date_range };
}

function detectContext(text: string, entities: AIAgentEntities): AvailabilityContext {
  let is_today = false;
  let is_tomorrow = false;
  let is_flexible = false;
  let is_specific_date = false;
  let time_preference: 'morning' | 'afternoon' | 'evening' | 'any' = 'any';
  let day_preference: string | null = null;

  if (text.includes('hoy') || entities.date === 'hoy' || entities.date_range === 'today') {
    is_today = true;
    is_specific_date = true;
  }

  if (text.includes('mañana') || text.includes('manana') || entities.date === 'mañana' || entities.date_range === 'tomorrow') {
    is_tomorrow = true;
    is_specific_date = true;
  }

  const urgencyScore = scoreKeywords(text, URGENCY_KEYWORDS);
  const is_urgent = urgencyScore >= 1;

  for (const kw of FLEXIBILITY_KEYWORDS) {
    if (text.includes(kw)) {
      is_flexible = true;
      break;
    }
  }

  for (const [pref, keywords] of Object.entries(TIME_PREFERENCES)) {
    const score = scoreKeywords(text, keywords);
    if (score >= 1) {
      time_preference = pref as 'morning' | 'afternoon' | 'evening';
      break;
    }
  }

  for (const [dayName, dayValue] of Object.entries(DAY_NAMES)) {
    if (text.includes(dayName)) {
      day_preference = dayValue;
      is_specific_date = true;
      break;
    }
  }

  if (entities.date !== null && !['hoy', 'mañana', 'manana'].includes(entities.date)) {
    is_specific_date = true;
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

function validateIntentResult(intent: string, confidence: number, context: AvailabilityContext, entities: AIAgentEntities): ValidationResult {
  const errors: string[] = [];

  if (intent === INTENTS.UNKNOWN) {
    errors.push('Intent is unknown');
  }

  const threshold = CONFIDENCE_THRESHOLDS[intent] ?? 0.3;
  if (confidence < threshold) {
    errors.push(`Confidence ${confidence.toFixed(2)} < threshold ${threshold} for intent ${intent}`);
  }

  if (context.is_today && context.is_tomorrow) {
    errors.push('Contradiction: is_today and is_tomorrow cannot both be true');
  }

  if (entities.date !== null) {
    if (!isValidDate(entities.date)) {
      errors.push(`Invalid date format: ${entities.date}`);
    }
  }

  if (entities.time !== null) {
    if (!isValidTime(entities.time)) {
      errors.push(`Invalid time format: ${entities.time}`);
    }
  }

  return { passed: errors.length === 0, errors };
}

function isValidDate(dateStr: string): boolean {
  const relativeDates = ['hoy', 'mañana', 'manana', 'pasado mañana', 'esta semana', 'próxima semana'];
  if (relativeDates.some(d => dateStr.toLowerCase().includes(d))) return true;
  
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{1,2}\/\d{1,2}$/,
    /^\d{1,2}-\d{1,2}$/
  ];
  return datePatterns.some(pattern => pattern.test(dateStr));
}

function isValidTime(timeStr: string): boolean {
  const timePatterns = [
    /^\d{1,2}:\d{2}$/,
    /^\d{1,2}:\d{2}\s*(am|pm)?$/i,
    /^\d{1,2}\s*(am|pm)$/i,
  ];
  return timePatterns.some(pattern => pattern.test(timeStr));
}

function suggestResponseType(
  intent: string,
  context: AvailabilityContext,
  entities: AIAgentEntities
): SuggestedResponseType {
  if (context.is_urgent || intent === INTENTS.URGENT_CARE) {
    return 'urgent_options';
  }

  switch (intent) {
    case INTENTS.GREETING: return 'greeting_response';
    case INTENTS.FAREWELL: return 'fallback';
    case INTENTS.THANK_YOU: return 'fallback';
    case INTENTS.CANCEL_APPOINTMENT: return 'cancellation_flow';
    case INTENTS.RESCHEDULE_APPOINTMENT: return 'reschedule_flow';
    
    case INTENTS.CREATE_APPOINTMENT:
      if (context.is_flexible) return 'general_search';
      if (context.day_preference !== null || context.time_preference !== 'any') return 'filtered_search';
      if (entities.date === null && entities.time === null) return 'clarifying_question';
      return 'booking_confirmation';

    case INTENTS.CHECK_AVAILABILITY:
      if (context.is_today || context.is_tomorrow) return 'no_availability_today';
      if (context.day_preference !== null || context.time_preference !== 'any') return 'filtered_search';
      if (context.is_specific_date) return 'availability_list';
      if (context.is_flexible) return 'general_search';
      return 'general_search';
      
    default:
      return 'fallback';
  }
}

function generateAIResponse(
  intent: string,
  entities: AIAgentEntities,
  context: AvailabilityContext,
  responseType: SuggestedResponseType,
  user_profile: { is_first_time: boolean | null; last_service: string | null; booking_count: number | null } | null,
  validation: ValidationResult
): { readonly aiResponse: string; readonly needsMoreInfo: boolean; readonly followUpQuestion: string | null } {
  
  let needsMoreInfo = false;
  let followUpQuestion: string | null = null;
  const isFirstTime = user_profile?.is_first_time ?? true;

  if (!validation.passed) {
    needsMoreInfo = true;
    followUpQuestion = 'Necesito un poco más de información para ayudarte mejor.';
  }

  let aiResponse = '';
  switch (responseType) {
    case 'urgent_options':
      aiResponse = `🚨 Entiendo que es **urgente**. Veo las opciones disponibles:\n\n1️⃣ **Lista de espera prioritaria**\n2️⃣ **Primera hora mañana**\n3️⃣ **Consulta express**\n\n¿Cuál opción prefieres?`;
      break;

    case 'availability_list':
      aiResponse = `📅 Déjame verificar la disponibilidad${entities.date !== null ? ` para ${entities.date}` : ''}...\n\n✨ Un momento, estoy consultando la agenda...`;
      break;

    case 'no_availability_today':
      aiResponse = `😅 Lo siento, pero hoy estamos completamente reservados.\n\n📅 Pero tengo buenas noticias:\n\n✅ **Mañana** tengo estas horas disponibles:\n   🕙 09:00 - Disponible\n   🕚 11:00 - Disponible\n   🕐 14:00 - Disponible\n\n¿Te gustaría reservar para mañana?`;
      break;

    case 'no_availability_extended':
      aiResponse = `😓 Lo siento, estamos completamente reservados por los próximos 7 días.\n\n📋 Opciones:\n1️⃣ **Lista de Espera**\n2️⃣ **Próxima disponibilidad**`;
      break;

    case 'general_search':
      aiResponse = `📅 Te ayudo a buscar disponibilidad.\n\n${context.is_flexible ? '✨ Veo que eres flexible, eso es bueno! ' : ''}¿Tienes alguna preferencia de día u horario?`;
      needsMoreInfo = true;
      followUpQuestion = followUpQuestion ?? '¿Qué día u horario prefieres?';
      break;

    case 'filtered_search':
      aiResponse = `📅 Entendido! Busco disponibilidad${context.day_preference !== null ? ` los ${context.day_preference}` : ''}${context.time_preference !== 'any' ? ` por la ${context.time_preference}` : ''}.\n\nDéjame consultar la agenda...`;
      break;

    case 'booking_confirmation':
      aiResponse = `✅ ¡Claro! Puedo ayudarte a agendar una cita.\n\n📋 **Detalles:**\n- 📅 Fecha: ${entities.date ?? 'Por definir'}\n- 🕐 Hora: ${entities.time ?? 'Por definir'}\n\n${isFirstTime ? '👋 Veo que es tu primera vez por aquí! ' : ''}¿Confirmas estos detalles?`;
      break;

    case 'cancellation_flow':
      aiResponse = `❌ Entiendo que necesitas cancelar una cita.\n\nPor favor proporcióname el ID de tu reserva o fecha.`;
      needsMoreInfo = true;
      followUpQuestion = followUpQuestion ?? '¿Cuál es el ID de tu reserva?';
      break;

    case 'reschedule_flow':
      aiResponse = `🔄 Quieres reprogramar tu cita. Entendido!\n\nNecesito saber tu reserva actual y para cuándo la quieres cambiar.`;
      needsMoreInfo = true;
      followUpQuestion = followUpQuestion ?? '¿Cuál es tu reserva actual?';
      break;

    case 'clarifying_question':
      aiResponse = `🤔 Para ayudarte mejor, necesito un poco más de información.\n\n¿Qué tipo de servicio estás buscando y cuándo?`;
      needsMoreInfo = true;
      followUpQuestion = followUpQuestion ?? '¿Qué servicio necesitas y cuándo prefieres?';
      break;

    case 'greeting_response':
      aiResponse = `👋 ¡Hola! ${isFirstTime ? '¡Bienvenido! Veo que es tu primera vez por aquí.' : '¡qué bueno verte de nuevo!'}\n\nSoy tu asistente virtual de reservas. ¿En qué puedo ayudarte hoy?`;
      break;

    case 'fallback':
    default:
      aiResponse = `🤔 No estoy seguro de entender completamente. ¿Podrías ser más específico?`;
      needsMoreInfo = true;
      followUpQuestion = followUpQuestion ?? '¿Qué tipo de ayuda necesitas?';
      break;
  }

  return { aiResponse, needsMoreInfo, followUpQuestion };
}
