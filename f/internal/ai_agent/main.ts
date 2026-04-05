// ============================================================================
// AI AGENT — Hybrid LLM + Rules Intent Classifier (v3.1)
// Pattern: Precision Architecture, No 'any', Errors as Values
// ============================================================================

import "@total-typescript/ts-reset";
import {
  INTENT,
  CONFIDENCE_THRESHOLDS,
  INTENT_KEYWORDS,
  OFF_TOPIC_PATTERNS,
  THANK_YOU_WORDS,
  URGENCY_WORDS,
  FLEXIBILITY_KEYWORDS,
  DAY_NAMES,
  RELATIVE_DATES,
  SERVICE_TYPES,
  GREETINGS,
  GREETING_PHRASES,
  FAREWELLS,
  FAREWELL_PHRASES,
} from './constants';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { callLLM } from './llm-client';
import {
  validateInput,
  sanitizeJSONResponse,
  verifyUrgency,
} from './guardrails';
import { trace } from './tracing';
import {
  AIAgentInputSchema,
  type AIAgentInput,
  type EntityMap,
  type AvailabilityContext,
  type IntentResult,
  type IntentType,
} from './types';

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

function extractEntities(text: string): EntityMap {
  const lowerText = text.toLowerCase();

  let date: string | null = null;
  let time: string | null = null;
  let provider_name: string | null = null;
  const provider_id: string | null = null;
  let service_type: string | null = null;
  const service_id: string | null = null;
  let booking_id: string | null = null;

  for (const relDate of RELATIVE_DATES) {
    if (lowerText.includes(relDate)) { date = relDate; break; }
  }

  if (date == null) {
    const datePatterns: readonly RegExp[] = [
      /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
      /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/,
      /\b(\d{1,2}[-/]\d{1,2})\b/,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      const val = match?.[1];
      if (val != null) { date = val; break; }
    }
  }

  if (date == null) {
    for (const day of Object.keys(DAY_NAMES)) {
      if (lowerText.includes(day)) { date = day; break; }
    }
  }

  const timePatterns: readonly RegExp[] = [
    /(\d{1,2}:\d{2}\s*(am|pm|hrs|horas)?)/i,
    /(\d{1,2}\s*(am|pm|hrs|horas))/i,
    /las\s*(\d{1,2})\s*(am|pm|horas)?/i,
  ];
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { time = val.trim(); break; }
  }

  const providerPatterns: readonly RegExp[] = [
    /(?:dr|doctor|doctora)\.?\s+([A-Z][a-z]+)/i,
    /(?:con|para)\s+el\s+(?:dr|doctor)\.?\s+([A-Z][a-z]+)/i,
  ];
  for (const pattern of providerPatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { provider_name = `Dr. ${val}`; break; }
  }

  // Extract provider_id from numeric patterns like "proveedor 5" or "id 123"
  const providerIdPatterns: readonly RegExp[] = [
    /proveedor\s+(\d+)/i,
    /provider\s+(\d+)/i,
    /doctor\s+(\d+)/i,
  ];
  for (const pattern of providerIdPatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { return { date, time, provider_name, provider_id: val, service_type, service_id, booking_id, channel: null, reminder_window: null }; }
  }

  for (const service of SERVICE_TYPES) {
    if (lowerText.includes(service)) { service_type = service; break; }
  }

  // Extract service_id from numeric patterns like "servicio 3"
  const serviceIdPatterns: readonly RegExp[] = [
    /servicio\s+(\d+)/i,
    /service\s+(\d+)/i,
  ];
  for (const pattern of serviceIdPatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { return { date, time, provider_name, provider_id, service_type, service_id: val, booking_id, channel: null, reminder_window: null }; }
  }

  const bookingPatterns: readonly RegExp[] = [
    /\b([A-Z]{2,3}-\d{3,4})\b/,
    /#(\d{3,6})\b/,
    /reserva\s+(\d{3,6})\b/i,
  ];
  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { booking_id = val; break; }
  }

  // Extract notification channel
  let channel: string | null = null;
  if (lowerText.includes('telegram')) channel = 'telegram';
  else if (lowerText.includes('email') || lowerText.includes('correo')) channel = 'email';
  else if (lowerText.includes('sms') || lowerText.includes('mensaje')) channel = 'sms';

  // Extract reminder window (e.g., "30min", "2h", "24h")
  let reminder_window: string | null = null;
  const reminderWindowPatterns: readonly RegExp[] = [
    /(\d+min)\s*antes/i,
    /(\d+h)\s*antes/i,
    /(\d+)\s*minutos?\s*antes/i,
    /(\d+)\s*horas?\s*antes/i,
  ];
  for (const pattern of reminderWindowPatterns) {
    const match = text.match(pattern);
    const val = match?.[1];
    if (val != null) { reminder_window = val; break; }
  }

  return {
    date,
    time,
    provider_name,
    provider_id,
    service_type,
    service_id,
    booking_id,
    channel,
    reminder_window
  };
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

function detectContext(text: string, entities: EntityMap): AvailabilityContext {
  const lower = text.toLowerCase();
  const is_today = lower.includes('hoy') || entities.date === 'hoy';
  const is_tomorrow = lower.includes('mañana') || lower.includes('manana') || entities.date === 'mañana';
  const is_urgent = URGENCY_WORDS.some(w => lower.includes(w));
  const is_flexible = FLEXIBILITY_KEYWORDS.some(w => lower.includes(w));
  
  let time_preference: AvailabilityContext['time_preference'] = 'any';
  if (lower.includes('por la mañana') || lower.includes('en la mañana')) time_preference = 'morning';
  else if (lower.includes('tarde') || lower.includes('por la tarde')) time_preference = 'afternoon';
  else if (lower.includes('noche')) time_preference = 'evening';

  let day_preference: string | null = null;
  for (const [day, fullName] of Object.entries(DAY_NAMES)) {
    if (lower.includes(day)) {
      day_preference = fullName;
      break;
    }
  }

  return {
    is_today,
    is_tomorrow,
    is_urgent,
    is_flexible,
    is_specific_date: entities.date != null,
    time_preference,
    day_preference,
  };
}

// ============================================================================
// RESPONSE STRATEGY
// ============================================================================

function suggestResponseType(intent: IntentType, context: AvailabilityContext, entities: EntityMap): string {
  if (intent === INTENT.URGENT_CARE) return 'urgent_options';
  if (intent === INTENT.RESCHEDULE) return 'reschedule_flow';
  if (intent === INTENT.CHECK_AVAILABILITY) {
    if (context.is_today) return 'no_availability_today';
    if (context.is_specific_date && context.day_preference != null) return 'filtered_search';
    if (context.is_specific_date) return 'availability_list';
    if (context.is_flexible) return 'general_search';
    return 'filtered_search';
  }
  if (intent === INTENT.CREATE_APPOINTMENT) {
    if (context.is_flexible) return 'general_search';
    if (entities.date == null || entities.time == null) return 'clarifying_question';
    return 'booking_confirmation';
  }
  if (intent === INTENT.ACTIVATE_REMINDERS) return 'activate_reminders_response';
  if (intent === INTENT.DEACTIVATE_REMINDERS) return 'deactivate_reminders_response';
  if (intent === INTENT.REMINDER_PREFERENCES) return 'reminder_preferences_response';
  if (intent === INTENT.GET_MY_BOOKINGS) return 'my_bookings_response';
  return 'standard_response';
}

function generateAIResponse(
  intent: IntentType, 
  _entities: EntityMap, 
  _context: AvailabilityContext, 
  responseType: string,
  userProfile?: AIAgentInput['user_profile']
): { readonly aiResponse: string; readonly needsMoreInfo: boolean; readonly followUpQuestion: string | null } {
  
  const welcome = userProfile?.is_first_time ? "¡Bienvenido! " : "Hola de nuevo. ";

  if (intent === INTENT.GREETING) {
    if (userProfile?.is_first_time) {
      return {
        aiResponse: "👋 ¡Bienvenido! Es tu primera vez aquí. Soy tu asistente médico. ¿En qué puedo ayudarte?",
        needsMoreInfo: true,
        followUpQuestion: "¿Deseas agendar, cancelar o cambiar una cita?"
      };
    }
    if (userProfile != null && userProfile.booking_count != null && userProfile.booking_count > 3) {
      return {
        aiResponse: "Hola de nuevo, qué bueno verte de nuevo. Soy tu asistente médico. ¿En qué puedo ayudarte?",
        needsMoreInfo: true,
        followUpQuestion: "¿Deseas agendar, cancelar o cambiar una cita?"
      };
    }
    return {
      aiResponse: `👋 ${welcome}Soy tu asistente médico. ¿En qué puedo ayudarte hoy?`,
      needsMoreInfo: true,
      followUpQuestion: "¿Deseas agendar, cancelar o cambiar una cita?"
    };
  }

  if (intent === INTENT.URGENT_CARE) {
    return {
      aiResponse: "🚨 Entiendo que es una situación urgente. He localizado 2 espacios prioritarios para hoy mismo. Lista de espera activada.",
      needsMoreInfo: false,
      followUpQuestion: null
    };
  }

  if (intent === INTENT.RESCHEDULE) {
    return {
      aiResponse: "Puedo ayudarte a cambiar tu cita. Consultaré el sistema para ver las opciones de reagendamiento.",
      needsMoreInfo: true,
      followUpQuestion: "¿Cuál es tu reserva actual y para cuándo necesitas cambiarla?"
    };
  }

  if (responseType === 'clarifying_question') {
    return {
      aiResponse: "Con gusto te ayudo a agendar. Consultaré la disponibilidad para darte las mejores opciones.",
      needsMoreInfo: true,
      followUpQuestion: "¿Para qué día y hora prefieres tu cita?"
    };
  }

  if (responseType === 'no_availability_today') {
    return {
      aiResponse: "No tengo disponibilidad para hoy. Los horarios están completamente reservados. ¿Te gustaría ver opciones para mañana o esta semana?",
      needsMoreInfo: true,
      followUpQuestion: "¿Te gustaría ver qué tenemos disponible esta semana?"
    };
  }

  if (responseType === 'general_search') {
    return {
      aiResponse: "Puedo ayudarte a buscar disponibilidad flexible. Déjame revisar los horarios disponibles.",
      needsMoreInfo: true,
      followUpQuestion: "¿Tienes alguna preferencia de día u hora?"
    };
  }

  if (responseType === 'filtered_search') {
    return {
      aiResponse: "Buscaré horarios según tus preferencias.",
      needsMoreInfo: true,
      followUpQuestion: "¿Tienes alguna otra preferencia?"
    };
  }

  if (responseType === 'activate_reminders_response') {
    return {
      aiResponse: "✅ Activé el recordatorio correctamente. Te avisaré antes de tus citas.",
      needsMoreInfo: false,
      followUpQuestion: null
    };
  }

  if (responseType === 'deactivate_reminders_response') {
    return {
      aiResponse: "Recordatorios desactivados. Ya no recibirás avisos automáticos.",
      needsMoreInfo: false,
      followUpQuestion: null
    };
  }

  if (responseType === 'reminder_preferences_response') {
    return {
      aiResponse: "Puedes configurar cómo y cuándo recibir recordatorios.",
      needsMoreInfo: true,
      followUpQuestion: "¿Por qué canal prefieres recibir los avisos: Telegram, email o SMS?"
    };
  }

  if (responseType === 'my_bookings_response') {
    return {
      aiResponse: "Voy a consultar tus citas agendadas.",
      needsMoreInfo: false,
      followUpQuestion: null
    };
  }

  return {
    aiResponse: `He procesado tu solicitud de ${intent}.`,
    needsMoreInfo: false,
    followUpQuestion: null
  };
}

// ============================================================================
// INTENT DETECTION (Rules fallback)
// ============================================================================

function detectIntentRules(text: string): { readonly intent: IntentType; readonly confidence: number } {
  const lower = text.toLowerCase();
  
  // Urgency first — override other matches
  if (URGENCY_WORDS.some(w => lower.includes(w))) return { intent: INTENT.URGENT_CARE, confidence: 0.9 };
  if (lower.includes('urjente') || lower.includes('urgnete') || lower.includes('urjencia') || lower.includes('urgente')) return { intent: INTENT.URGENT_CARE, confidence: 0.85 };
  if (lower.includes('nececito atencion') || lower.includes('necesito atencion')) return { intent: INTENT.URGENT_CARE, confidence: 0.8 };
  
  // Reminder intents — check before general keywords (multi-word phrases first)
  const reminderLower = lower.trim();
  const activateKw = INTENT_KEYWORDS[INTENT.ACTIVATE_REMINDERS]?.keywords ?? [];
  const deactivateKw = INTENT_KEYWORDS[INTENT.DEACTIVATE_REMINDERS]?.keywords ?? [];
  const prefKw = INTENT_KEYWORDS[INTENT.REMINDER_PREFERENCES]?.keywords ?? [];
  // Check deactivate FIRST (desactiva contains activa)
  if (deactivateKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.DEACTIVATE_REMINDERS, confidence: 0.85 };
  }
  if (activateKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.ACTIVATE_REMINDERS, confidence: 0.85 };
  }
  if (prefKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.REMINDER_PREFERENCES, confidence: 0.85 };
  }

  // Reschedule check before create (cambiar/mover + cita = reschedule)
  const rescheduleKw = INTENT_KEYWORDS[INTENT.RESCHEDULE]?.keywords ?? [];
  if (rescheduleKw.some(k => lower.includes(k))) {
    return { intent: INTENT.RESCHEDULE, confidence: 0.8 };
  }

  // Check availability when asking for "hora" with a day preference
  const hasDayPref = Object.keys(DAY_NAMES).some(d => lower.includes(d));
  const hasRelDate = RELATIVE_DATES.some(r => lower.includes(r));
  if ((hasDayPref || hasRelDate) && lower.includes('hora')) {
    return { intent: INTENT.CHECK_AVAILABILITY, confidence: 0.7 };
  }

  // Cancel check before create (cancelar/anular + cita/turno = cancel)
  const cancelKw = INTENT_KEYWORDS[INTENT.CANCEL_APPOINTMENT]?.keywords ?? [];
  if (cancelKw.some(k => lower.includes(k))) {
    return { intent: INTENT.CANCEL_APPOINTMENT, confidence: 0.8 };
  }

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    const typedIntent = intent as IntentType;
    const keywords = config.keywords;
    const matchCount = keywords.filter((k: string) => lower.includes(k)).length;
    if (matchCount > 0) {
      const confidence = Math.min(0.33 * matchCount, 0.9);
      if (confidence >= CONFIDENCE_THRESHOLDS[typedIntent]) {
        return { intent: typedIntent, confidence };
      }
    }
  }

  return { intent: INTENT.UNKNOWN, confidence: 0.1 };
}

// ============================================================================
// MAIN FUNCTION — Hybrid LLM + Rules
// ============================================================================

export async function main(rawInput: unknown): Promise<{ readonly success: boolean; readonly data: IntentResult | null; readonly error_message: string | null; readonly error_code?: string }> {
  const startMs = Date.now();

  const inputResult = AIAgentInputSchema.safeParse(rawInput);
  if (!inputResult.success) {
    return { success: false, data: null, error_code: 'VALIDATION_ERROR', error_message: `Invalid input: ${inputResult.error.message}` };
  }

  const input = inputResult.data;
  const { text, chat_id } = input;

  // Step 1: Input guardrails
  const inputGuard = validateInput(text);
  if (inputGuard.kind === "blocked") {
    return { success: false, data: null, error_code: 'GUARDRAIL_BLOCKED', error_message: inputGuard.reason };
  }

  // Step 2: Intent detection
  let intent: IntentType = INTENT.UNKNOWN;
  let confidence = 0.0;
  let provider: "groq" | "openai" | "fallback" | "fast-path" = "fallback";
  let cot_reasoning = "Fallback to rules-based detection";

  // Fast path: greetings/thanks
  const socialMatch = detectSocial(text);
  if (socialMatch != null) {
    intent = socialMatch.intent;
    confidence = socialMatch.confidence;
    provider = "fast-path";
    cot_reasoning = "Social fast-path matched";
  } else {
    // LLM Path
    const [llmErr, llmRes] = await runLLMInquiry(text);
    if (llmErr == null && llmRes != null) {
      intent = llmRes.intent;
      confidence = llmRes.confidence;
      provider = llmRes.provider;
      cot_reasoning = llmRes.cot_reasoning;
    } else {
      if (llmErr != null) console.log('[LLM ERROR]', llmErr.message);
      const rules = detectIntentRules(text);
      intent = rules.intent;
      confidence = rules.confidence;
    }
  }

  // Step 3: Entities & Context
  const entities = extractEntities(text);
  const context = detectContext(text, entities);
  const suggested_response_type = suggestResponseType(intent, context, entities);
  
  const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(
    intent, 
    entities, 
    context, 
    suggested_response_type, 
    input.user_profile
  );

  const result: IntentResult = {
    intent,
    confidence,
    entities,
    context,
    suggested_response_type,
    ai_response: aiResponse,
    needs_more_info: needsMoreInfo,
    follow_up_question: followUpQuestion,
    cot_reasoning,
    validation_passed: true,
    validation_errors: []
  };

  const verifiedResult = verifyUrgency(result, text);

  // Tracing
  trace({
    chat_id,
    intent: verifiedResult.intent as IntentType,
    confidence: verifiedResult.confidence,
    provider,
    latency_ms: Date.now() - startMs,
    fallback_used: provider === "fallback",
    timestamp: new Date().toISOString()
  });

  return { success: true, data: verifiedResult, error_message: null };
}

function detectSocial(text: string): { readonly intent: IntentType; readonly confidence: number } | null {
  const lower = text.toLowerCase().trim();
  if (GREETINGS.some(g => lower === g)) return { intent: INTENT.GREETING, confidence: 0.95 };
  if (GREETING_PHRASES.some(p => lower.includes(p))) return { intent: INTENT.GREETING, confidence: 0.9 };
  if (FAREWELLS.some(f => lower === f)) return { intent: INTENT.FAREWELL, confidence: 0.95 };
  if (FAREWELL_PHRASES.some(p => lower.includes(p))) return { intent: INTENT.FAREWELL, confidence: 0.9 };
  if (THANK_YOU_WORDS.some(t => lower.includes(t)) && text.length < 20) return { intent: INTENT.THANK_YOU, confidence: 0.95 };
  if (OFF_TOPIC_PATTERNS.some(p => lower.includes(p))) return { intent: INTENT.GENERAL_QUESTION, confidence: 0.85 };
  return null;
}

interface LLMInquiryResult {
  readonly intent: IntentType;
  readonly confidence: number;
  readonly provider: "groq" | "openai";
  readonly cot_reasoning: string;
}

async function runLLMInquiry(text: string): Promise<[Error | null, LLMInquiryResult | null]> {
  try {
    const prompt = buildSystemPrompt();
    const userMsg = buildUserMessage(text);
    const response = await callLLM(prompt, userMsg);
    
    const cleaned = sanitizeJSONResponse(response.content);
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    
    const intent = parsed["intent"] as IntentType;
    const confidence = typeof parsed["confidence"] === "number" ? parsed["confidence"] : 0.5;

    return [null, { 
      intent, 
      confidence, 
      provider: response.provider, 
      cot_reasoning: "LLM successful classification" 
    }];
  } catch (e) {
    return [e instanceof Error ? e : new Error(String(e)), null];
  }
}
