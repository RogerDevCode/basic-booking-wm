import { z } from "zod";
import "@total-typescript/ts-reset";
import {
  INTENT,
  CONFIDENCE_THRESHOLDS,
  INTENT_KEYWORDS,
  NORMALIZATION_MAP,
  PROFANITY_TO_IGNORE,
  OFF_TOPIC_PATTERNS,
  GREETINGS,
  GREETING_PHRASES,
  FAREWELLS,
  FAREWELL_PHRASES,
  THANK_YOU_WORDS,
  URGENCY_WORDS,
  FLEXIBILITY_KEYWORDS,
  DAY_NAMES,
  RELATIVE_DATES,
  SERVICE_TYPES,
} from './constants';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { callLLM } from './llm-client';
import {
  validateInput,
  validateOutput,
  parseAndValidateLLMResult,
  crossCheckUrgency,
} from './guardrails';
import { trace, buildTrace } from './tracing';

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

export interface AIAgentEntities {
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

  for (const relDate of RELATIVE_DATES) {
    if (lowerText.includes(relDate)) { date = relDate; break; }
  }

  if (!date) {
    const datePatterns = [
      /\b(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/,
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
      /\b(\d{1,2}[\/\-]\d{1,2})\b/,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) { date = match[1]; break; }
    }
  }

  if (!date) {
    for (const day of Object.keys(DAY_NAMES)) {
      if (lowerText.includes(day)) { date = day; break; }
    }
  }

  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm|hrs|horas)?)/i,
    /(\d{1,2}\s*(am|pm|hrs|horas))/i,
    /las\s*(\d{1,2})\s*(am|pm|horas)?/i,
  ];
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) { time = match[1].trim(); break; }
  }

  const providerPatterns = [
    /(?:dr|doctor|doctora)\.?\s+([A-Z][a-z]+)/i,
    /(?:con|para)\s+el\s+(?:dr|doctor)\.?\s+([A-Z][a-z]+)/i,
  ];
  for (const pattern of providerPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) { provider_name = `Dr. ${match[1]}`; break; }
  }

  for (const service of SERVICE_TYPES) {
    if (lowerText.includes(service)) { service_type = service; break; }
  }

  const provIdMatch = text.match(/proveedor\s+(\w+)/i);
  if (provIdMatch?.[1]) { provider_id = provIdMatch[1]; }

  const servIdMatch = text.match(/servicio\s+(\w+)/i);
  if (servIdMatch?.[1]) { service_id = servIdMatch[1]; }

  const bookingPatterns = [
    /(?:cita|reserva|turno|booking)\s*(?:id|número|numero)?\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    /\b([A-Z]{2,}\d{3,})\b/,
  ];
  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) { booking_id = match[1]; break; }
  }

  return { date, time, provider_name, provider_id, service_type, service_id, booking_id };
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

export interface AvailabilityContext {
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

  const is_today = lowerText.includes('hoy') || entities.date === 'hoy';
  const is_tomorrow = lowerText.includes('mañana') || lowerText.includes('manana') || entities.date === 'mañana' || entities.date === 'tomorrow';
  const is_urgent = URGENCY_WORDS.some(w => lowerText.includes(w));
  const is_flexible = FLEXIBILITY_KEYWORDS.some(k => lowerText.includes(k));
  const is_specific_date = entities.date !== null;

  let time_preference: 'morning' | 'afternoon' | 'evening' | 'any' = 'any';
  if (['mañana', 'antes de las 12', 'am', 'temprano'].some(k => lowerText.includes(k))) {
    time_preference = 'morning';
  } else if (['tarde', 'después de las', 'pm', 'despues'].some(k => lowerText.includes(k))) {
    time_preference = 'afternoon';
  } else if (['noche', 'después de las 18', 'despues de las 18'].some(k => lowerText.includes(k))) {
    time_preference = 'evening';
  }

  let day_preference: string | null = null;
  for (const [spanish, english] of Object.entries(DAY_NAMES)) {
    if (lowerText.includes(spanish)) { day_preference = english; break; }
  }

  return { is_today, is_tomorrow, is_urgent, is_flexible, is_specific_date, time_preference, day_preference };
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
  if (context.is_urgent || intent === INTENT.URGENT_CARE) return 'urgent_options';
  if (intent === INTENT.GREETING) return 'greeting_response';
  if (intent === INTENT.FAREWELL) return 'fallback';
  if (intent === INTENT.THANK_YOU) return 'fallback';
  if (intent === INTENT.CANCEL_APPOINTMENT) return 'cancellation_flow';
  if (intent === INTENT.RESCHEDULE) return 'reschedule_flow';

  if (intent === INTENT.CREATE_APPOINTMENT) {
    if (context.is_flexible) return 'general_search';
    if ((context.day_preference !== null || context.time_preference !== 'any') && !entities.time) return 'filtered_search';
    if (!entities.date && !entities.time) return 'clarifying_question';
    return 'booking_confirmation';
  }

  if (intent === INTENT.CHECK_AVAILABILITY) {
    if (context.is_today || context.is_tomorrow) return 'no_availability_today';
    if (context.day_preference !== null || context.time_preference !== 'any') return 'filtered_search';
    if (context.is_specific_date) return 'availability_list';
    return 'general_search';
  }

  if (intent === INTENT.UNKNOWN && (context.day_preference !== null || context.time_preference !== 'any')) {
    return 'filtered_search';
  }

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
// RULE-BASED FALLBACK (preserved from v2.0)
// ============================================================================

function removeProfanity(text: string): string {
  let clean = text.toLowerCase();
  for (const word of PROFANITY_TO_IGNORE) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  return clean.trim().replace(/\s+/g, ' ');
}

type IntentType = typeof INTENT[keyof typeof INTENT];

function detectGreetingOrFarewell(text: string): { intent: IntentType; confidence: number } | null {
  const lower = text.toLowerCase().trim();
  const stripped = lower.replace(/[¿?¡!,.]/g, '').trim();
  const words = stripped.split(/\s+/);

  if (FAREWELLS.includes(stripped) || FAREWELL_PHRASES.some(p => lower.includes(p))) {
    return { intent: INTENT.FAREWELL, confidence: 0.9 };
  }
  if (GREETINGS.includes(words[0]) || GREETING_PHRASES.some(p => lower.startsWith(p))) {
    if (words.length <= 4 || GREETINGS.includes(stripped)) {
      return { intent: INTENT.GREETING, confidence: 0.9 };
    }
  }
  if (stripped === 'saludos') return { intent: INTENT.GREETING, confidence: 0.9 };
  if (THANK_YOU_WORDS.some(w => lower.includes(w)) && words.length <= 4) {
    return { intent: INTENT.THANK_YOU, confidence: 0.9 };
  }
  return null;
}

function isOffTopic(text: string): boolean {
  return OFF_TOPIC_PATTERNS.some(pattern => text.toLowerCase().includes(pattern));
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
  if (lowerKeyword.includes(' ')) return lowerText.includes(lowerKeyword);
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

function detectIntentRules(text: string): { intent: IntentType; confidence: number } {
  if (isOffTopic(text)) return { intent: INTENT.GENERAL_QUESTION, confidence: 0.8 };
  const normalizedText = normalizeText(text);
  const greeting = detectGreetingOrFarewell(normalizedText);
  if (greeting) return greeting as { intent: IntentType; confidence: number };

  let bestIntent: IntentType = INTENT.UNKNOWN;
  let maxScore = 0;
  const lowerNorm = normalizedText.toLowerCase();

  if (/\breagendar\b/.test(lowerNorm)) return { intent: INTENT.RESCHEDULE, confidence: 1.0 };

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (fuzzyMatch(normalizedText, keyword)) score += config.weight;
    }
    if (score > maxScore) { maxScore = score; bestIntent = intent as IntentType; }
  }

  if (bestIntent === INTENT.URGENT_CARE) {
    if (!URGENCY_WORDS.some(w => lowerNorm.includes(w))) {
      maxScore = 0;
      bestIntent = INTENT.UNKNOWN;
      for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
        if (intent === INTENT.URGENT_CARE) continue;
        let score = 0;
        for (const keyword of config.keywords) {
          if (fuzzyMatch(normalizedText, keyword)) score += config.weight;
        }
        if (score > maxScore) { maxScore = score; bestIntent = intent as IntentType; }
      }
    }
  }

  const threshold = CONFIDENCE_THRESHOLDS[bestIntent] ?? 0.3;
  const confidence = maxScore > 0 ? Math.min(1.0, maxScore / threshold / 3) : 0.1;
  return { intent: bestIntent, confidence };
}

// ============================================================================
// FAST-PATH: Greeting/Farewell/ThankYou detection (avoids LLM call)
// ============================================================================

function tryFastPath(text: string): { intent: IntentType; confidence: number } | null {
  const lower = text.toLowerCase().trim();
  const stripped = lower.replace(/[¿?¡!,.]/g, '').trim();
  const words = stripped.split(/\s+/);

  // Pure greeting
  if (FAREWELLS.includes(stripped) || FAREWELL_PHRASES.some(p => lower.includes(p))) {
    return { intent: INTENT.FAREWELL, confidence: 0.9 };
  }
  if (GREETINGS.includes(words[0]) || GREETING_PHRASES.some(p => lower.startsWith(p))) {
    if (words.length <= 4 || GREETINGS.includes(stripped)) {
      return { intent: INTENT.GREETING, confidence: 0.9 };
    }
  }
  if (stripped === 'saludos') return { intent: INTENT.GREETING, confidence: 0.9 };
  if (THANK_YOU_WORDS.some(w => lower.includes(w)) && words.length <= 4) {
    return { intent: INTENT.THANK_YOU, confidence: 0.9 };
  }
  // Off-topic
  if (isOffTopic(text)) return { intent: INTENT.GENERAL_QUESTION, confidence: 0.8 };

  return null;
}

// ============================================================================
// MAIN FUNCTION — Hybrid LLM + Rules
// ============================================================================

export interface AIAgentInput {
  chat_id: string;
  text: string;
  user_profile?: {
    is_first_time: boolean;
    booking_count: number;
  };
}

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

    const text = input.data.text;
    const chatId = input.data.chat_id;
    const startMs = Date.now();

    // Step 1: Input guardrails
    const inputValidation = validateInput(text);
    if (!inputValidation.valid) {
      return { success: false, data: null, error_code: 'GUARDRAIL_BLOCKED', error_message: inputValidation.reason ?? 'Input blocked' };
    }

    // Step 2: Fast-path (greetings, farewells, thank-yous, off-topic)
    const fastPath = tryFastPath(text);
    if (fastPath) {
      const entities = extractEntities(text);
      const context = detectContext(text, entities);
      const suggested_response_type = suggestResponseType(fastPath.intent, context, entities);
      const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(fastPath.intent, entities, context, suggested_response_type, input.data.user_profile);

      trace(buildTrace(chatId, fastPath.intent, fastPath.confidence, 'fast-path', Date.now() - startMs, 0, 0, false, false));

      return {
        success: true,
        data: {
          intent: fastPath.intent,
          confidence: fastPath.confidence,
          chat_id: chatId,
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
    }

    // Step 3: LLM primary
    let intent: IntentType = INTENT.UNKNOWN;
    let confidence = 0.1;
    let llmEntities: Record<string, unknown> = {};
    let needsMore = false;
    let followUp: string | null = null;
    let provider = 'fallback';
    let tokensIn = 0;
    let tokensOut = 0;
    let llmError: string | null = null;

    try {
      const systemPrompt = buildSystemPrompt();
      const userMsg = buildUserMessage(text);

      // Validate output before sending
      const outputValidation = validateOutput(systemPrompt);
      if (!outputValidation.valid) {
        throw new Error('System prompt validation failed');
      }

      const llmResult = await callLLM(systemPrompt, userMsg);

      // Validate LLM output
      const outputCheck = validateOutput(llmResult.content);
      if (!outputCheck.valid) {
        throw new Error(outputCheck.reason ?? 'Output validation failed');
      }

      const parsed = parseAndValidateLLMResult(llmResult.content);
      if (parsed) {
        const crossChecked = crossCheckUrgency(parsed, text);
        intent = crossChecked.intent;
        confidence = crossChecked.confidence;
        llmEntities = crossChecked.entities;
        needsMore = crossChecked.needs_more;
        followUp = crossChecked.follow_up;
        provider = llmResult.provider;
        tokensIn = llmResult.tokens_in;
        tokensOut = llmResult.tokens_out;
      } else {
        llmError = 'Failed to parse LLM JSON';
      }
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
    }

    // Step 4: Fallback to rules if LLM failed or returned unknown with low confidence
    let fallbackUsed = false;
    if (llmError || intent === INTENT.UNKNOWN || confidence < 0.3) {
      const ruleResult = detectIntentRules(text);
      intent = ruleResult.intent;
      confidence = ruleResult.confidence;
      fallbackUsed = true;
    }

    // Step 5: Extract entities (rules are more reliable for regex patterns)
    const entities = extractEntities(text);

    // Merge LLM entities with rule entities (rules take precedence for regex-extracted fields)
    const mergedEntities: AIAgentEntities = {
      date: entities.date ?? (llmEntities['date'] as string | null) ?? null,
      time: entities.time ?? (llmEntities['time'] as string | null) ?? null,
      provider_name: entities.provider_name ?? (llmEntities['patient_name'] as string | null) ?? null,
      provider_id: entities.provider_id,
      service_type: entities.service_type ?? (llmEntities['service_type'] as string | null) ?? null,
      service_id: entities.service_id,
      booking_id: entities.booking_id ?? (llmEntities['booking_id'] as string | null) ?? null,
    };

    // Step 6: Context detection
    const context = detectContext(text, mergedEntities);

    // Step 7: Suggest response type
    const suggested_response_type = suggestResponseType(intent, context, mergedEntities);

    // Step 8: Generate AI response
    const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(intent, mergedEntities, context, suggested_response_type, input.data.user_profile);

    // Step 9: Trace
    trace(buildTrace(chatId, intent, confidence, provider, Date.now() - startMs, tokensIn, tokensOut, false, fallbackUsed));

    return {
      success: true,
      data: {
        intent,
        confidence,
        chat_id: chatId,
        entities: mergedEntities,
        context,
        suggested_response_type,
        ai_response: aiResponse,
        needs_more_info: needsMoreInfo || needsMore,
        follow_up_question: followUpQuestion ?? followUp,
        cot_reasoning: llmError ? `LLM error: ${llmError}` : '',
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

export type { SuggestedResponseType };
export { INTENT, CONFIDENCE_THRESHOLDS, NORMALIZATION_MAP, normalizeText, detectIntentRules as detectIntent, levenshtein, fuzzyMatch, extractEntities, detectContext, suggestResponseType, generateAIResponse };
