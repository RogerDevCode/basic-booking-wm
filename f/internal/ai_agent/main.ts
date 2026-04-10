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
  ESCALATION_THRESHOLDS,
  RULE_CONFIDENCE_VALUES,
  SOCIAL_CONFIDENCE_VALUES,
} from './constants';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { callLLM } from './llm-client';
import {
  validateInput,
  sanitizeJSONResponse,
  verifyUrgency,
} from './guardrails';
import { trace } from './tracing';
import { classifyIntent } from './tfidf-classifier';
import { buildRAGContext } from './rag-context';
import {
  AIAgentInputSchema,
  type AIAgentInput,
  type EntityMap,
  type AvailabilityContext,
  type IntentResult,
  type IntentType,
} from './types';

// Type guard for intent validation
function isIntentType(value: string): value is IntentType {
  return Object.values(INTENT).includes(value as IntentType);
}

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
  if (intent === INTENT.URGENCIA) return 'urgent_options';
  if (intent === INTENT.REAGENDAR) return 'reschedule_flow';
  if (intent === INTENT.CONSULTAR_DISPONIBILIDAD) {
    if (context.is_today) return 'no_availability_today';
    if (context.is_specific_date && context.day_preference != null) return 'filtered_search';
    if (context.is_specific_date) return 'availability_list';
    if (context.is_flexible) return 'general_search';
    return 'filtered_search';
  }
  if (intent === INTENT.CREAR_CITA) {
    if (context.is_flexible) return 'general_search';
    if (entities.date == null || entities.time == null) return 'clarifying_question';
    return 'booking_confirmation';
  }
  if (intent === INTENT.ACTIVAR_RECORDATORIOS) return 'activate_reminders_response';
  if (intent === INTENT.DESACTIVAR_RECORDATORIOS) return 'deactivate_reminders_response';
  if (intent === INTENT.PREFERENCIAS_RECORDATORIO) return 'reminder_preferences_response';
  if (intent === INTENT.VER_MIS_CITAS) return 'my_bookings_response';
  return 'standard_response';
}

// ── Dialogue Act & UI Component Mapping (ISO 22446) ──────────────────────

function mapToDialogueAndUI(
  suggestedType: string,
  intent: IntentType,
): { readonly dialogue_act: IntentResult['dialogue_act']; readonly ui_component: IntentResult['ui_component'] } {
  switch (suggestedType) {
    case 'urgent_options':
      return { dialogue_act: "offer", ui_component: "warning_card" };
    case 'reschedule_flow':
      return { dialogue_act: "request_action", ui_component: "form_card" };
    case 'no_availability_today':
      return { dialogue_act: "inform", ui_component: "text_message" };
    case 'availability_list':
    case 'my_bookings_response':
      return { dialogue_act: "inform", ui_component: "list_card" };
    case 'general_search':
    case 'filtered_search':
      return { dialogue_act: "offer", ui_component: "quick_replies" };
    case 'clarifying_question':
      return { dialogue_act: "question", ui_component: "text_message" };
    case 'booking_confirmation':
      return { dialogue_act: "confirm", ui_component: "confirmation_card" };
    case 'activate_reminders_response':
    case 'deactivate_reminders_response':
      return { dialogue_act: "confirm", ui_component: "text_message" };
    case 'reminder_preferences_response':
      return { dialogue_act: "question", ui_component: "quick_replies" };
    default:
      if (intent === INTENT.DESPEDIDA) return { dialogue_act: "close", ui_component: "text_message" };
      if (intent === INTENT.SALUDO) return { dialogue_act: "acknowledge", ui_component: "text_message" };
      return { dialogue_act: "inform", ui_component: "text_message" };
  }
}

// ── Escalation Level (thresholds explícitos) ─────────────────────────────

function determineEscalationLevel(
  intent: IntentType,
  text: string,
  confidence: number,
): IntentResult['escalation_level'] {
  const lower = text.toLowerCase();
  if (intent === INTENT.URGENCIA && confidence >= ESCALATION_THRESHOLDS.medical_emergency_min) {
    if (/muerte|morir|no respiro|infarto|desmay|sangr|convul|paro|dolor.*pecho|dificultad.*respir|no puedo.*respir/.test(lower)) {
      return 'medical_emergency';
    }
  }
  if (intent === INTENT.URGENCIA && confidence < ESCALATION_THRESHOLDS.priority_queue_max) return 'priority_queue';
  if (confidence < ESCALATION_THRESHOLDS.human_handoff_max && intent !== INTENT.SALUDO && intent !== INTENT.DESPEDIDA && intent !== INTENT.AGRADECIMIENTO) return 'human_handoff';
  return 'none';
}

function generateAIResponse(
  intent: IntentType, 
  _entities: EntityMap, 
  _context: AvailabilityContext, 
  responseType: string,
  userProfile?: AIAgentInput['user_profile']
): { readonly aiResponse: string; readonly needsMoreInfo: boolean; readonly followUpQuestion: string | null } {
  
  const welcome = userProfile?.is_first_time ? "¡Bienvenido! " : "Hola de nuevo. ";

  if (intent === INTENT.SALUDO) {
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

  if (intent === INTENT.URGENCIA) {
    return {
      aiResponse: "🚨 Entiendo que es una situación urgente. He localizado 2 espacios prioritarios para hoy mismo. Lista de espera activada.",
      needsMoreInfo: false,
      followUpQuestion: null
    };
  }

  if (intent === INTENT.REAGENDAR) {
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
  
  // Urgency first — but only when it's MEDICAL urgency, not general context
  // "emergencia familiar" ≠ medical urgency
  // "dolor en el pecho" = medical urgency
  const medicalUrgencyPatterns = [
    'dolor', 'sangrando', 'no puedo esperar', 'urgente', 'emergencia', 'urgencia',
    'urjente', 'urgnete', 'urjencia', 'urgente',
    'nececito atencion', 'necesito atencion',
  ];
  const hasMedicalUrgency = medicalUrgencyPatterns.some(w => lower.includes(w));
  // Exclude non-medical contexts
  const hasNonMedicalContext = lower.includes('emergencia familiar') || lower.includes('emergencia laboral');
  if (hasMedicalUrgency && !hasNonMedicalContext) return { intent: INTENT.URGENCIA, confidence: RULE_CONFIDENCE_VALUES.urgencia_medical };
  
  // Reminder intents — check before general keywords (multi-word phrases first)
  const reminderLower = lower.trim();
  const activateKw = INTENT_KEYWORDS[INTENT.ACTIVAR_RECORDATORIOS]?.keywords ?? [];
  const deactivateKw = INTENT_KEYWORDS[INTENT.DESACTIVAR_RECORDATORIOS]?.keywords ?? [];
  const prefKw = INTENT_KEYWORDS[INTENT.PREFERENCIAS_RECORDATORIO]?.keywords ?? [];
  // Check deactivate FIRST (desactiva contains activa)
  if (deactivateKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.DESACTIVAR_RECORDATORIOS, confidence: RULE_CONFIDENCE_VALUES.reminder_rule };
  }
  if (activateKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.ACTIVAR_RECORDATORIOS, confidence: RULE_CONFIDENCE_VALUES.reminder_rule };
  }
  if (prefKw.some(k => reminderLower.includes(k))) {
    return { intent: INTENT.PREFERENCIAS_RECORDATORIO, confidence: RULE_CONFIDENCE_VALUES.reminder_rule };
  }

  // Reschedule check — but only when NOT explicitly creating new appointment
  // "Quiero agendar para otro día" → create (new appointment for another day)
  // "Quiero cambiar mi cita" → reschedule (modify existing)
  const rescheduleKw = INTENT_KEYWORDS[INTENT.REAGENDAR]?.keywords ?? [];
  // Core create keywords (not "cita" which appears everywhere)
  const coreCreateKw = ['agendar', 'reservar', 'ajendar', 'sacar', 'pedir hora', 'necesito hora', 'consulta', 'visita', 'ver al doctor', 'konsulta', 'cosulta', 'resevar', 'truno', 'sita', 'agenda'];
  const hasRescheduleKeyword = rescheduleKw.some(k => lower.includes(k));
  const hasCreateKeyword = coreCreateKw.some(k => lower.includes(k));

  // If user says "agendar"/"reservar", it's create (even with "otro día")
  // Otherwise if reschedule keywords match, use reschedule
  if (hasRescheduleKeyword && !hasCreateKeyword) {
    return { intent: INTENT.REAGENDAR, confidence: RULE_CONFIDENCE_VALUES.reschedule_rule };
  }

  // Check availability when asking for "hora" with a day preference
  const hasDayPref = Object.keys(DAY_NAMES).some(d => lower.includes(d));
  const hasRelDate = RELATIVE_DATES.some(r => lower.includes(r));
  if ((hasDayPref || hasRelDate) && lower.includes('hora')) {
    return { intent: INTENT.CONSULTAR_DISPONIBILIDAD, confidence: RULE_CONFIDENCE_VALUES.availability_rule };
  }

  // Cancel check before create (cancelar/anular + cita/turno = cancel)
  const cancelKw = INTENT_KEYWORDS[INTENT.CANCELAR_CITA]?.keywords ?? [];
  if (cancelKw.some(k => lower.includes(k))) {
    return { intent: INTENT.CANCELAR_CITA, confidence: RULE_CONFIDENCE_VALUES.cancel_rule };
  }

  for (const [intent, config] of Object.entries(INTENT_KEYWORDS)) {
    const typedIntent = intent as IntentType;
    // Skip reschedule if user explicitly says "agendar"/"reservar"
    if (typedIntent === INTENT.REAGENDAR && hasCreateKeyword) continue;
    const keywords = config.keywords;
    const matchCount = keywords.filter((k: string) => lower.includes(k)).length;
    if (matchCount > 0) {
      const confidence = Math.min(0.33 * matchCount, 0.9);
      if (confidence >= CONFIDENCE_THRESHOLDS[typedIntent]) {
        return { intent: typedIntent, confidence };
      }
    }
  }

  return { intent: INTENT.DESCONOCIDO, confidence: RULE_CONFIDENCE_VALUES.desconocido };
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
  const { text, chat_id, provider_id: _provider_id } = input;

  // Step 1: Input guardrails
  const inputGuard = validateInput(text);
  if (inputGuard.kind === "blocked") {
    return { success: false, data: null, error_code: 'GUARDRAIL_BLOCKED', error_message: inputGuard.reason };
  }

  // Step 2: Intent detection
  let intent: IntentType = INTENT.DESCONOCIDO;
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
    // TF-IDF semantic classification (fallback when social doesn't match)
    const tfidfResult = classifyIntent(text);

    // Only use TF-IDF if confidence is strong AND input has enough content
    const hasEnoughContent = text.trim().split(/\s+/).length >= 2;
    if (tfidfResult.confidence >= ESCALATION_THRESHOLDS.tfidf_minimum && hasEnoughContent) {
      const tfidfIntent = tfidfResult.intent as IntentType;
      if (isIntentType(tfidfIntent)) {
        intent = tfidfIntent;
        confidence = Math.max(tfidfResult.confidence, 0.5);
        provider = "fallback";
        cot_reasoning = `TF-IDF semantic match (${tfidfResult.scores[0]?.intent ?? 'unknown'})`;
      }
    }

    // Check if LLM should be skipped (test mode or no credits)
    const skipLLM = (() => {
      try { if (typeof process !== 'undefined' && process.env['AI_AGENT_LLM_MODE'] === 'test') return true; } catch { /* ignore */ }
      return false;
    })();

    if (!skipLLM) {
      // RAG: Build context from knowledge base for general questions
      let ragContext: string | undefined;
      if (intent === INTENT.PREGUNTA_GENERAL || intent === INTENT.DESCONOCIDO) {
        const ragResult = await buildRAGContext(_provider_id ?? null, text, 3);
        ragContext = ragResult.context;
        if (ragResult.count > 0) {
          const scope = ragResult.hasProviderSpecific ? 'provider-specific + public' : 'public only';
          cot_reasoning = `RAG: ${String(ragResult.count)} FAQs found (${scope})`;
        }
      }

      // LLM Path
      const systemPrompt = buildSystemPrompt(ragContext);
      const userMsg = buildUserMessage(text);
      const [llmErr, llmRes] = await runLLMInquiryWithPrompt(systemPrompt, userMsg);
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
    } else {
      // Test mode: use rule-based fallback directly
      const rules = detectIntentRules(text);
      intent = rules.intent;
      confidence = rules.confidence;
    }
  }

  // Step 3: Entities & Context
  const entities = extractEntities(text);
  const context = detectContext(text, entities);
  const suggested_response_type = suggestResponseType(intent, context, entities);
  const { dialogue_act, ui_component } = mapToDialogueAndUI(suggested_response_type, intent);

  const { aiResponse, needsMoreInfo, followUpQuestion } = generateAIResponse(
    intent,
    entities,
    context,
    suggested_response_type,
    input.user_profile
  );

  const escalation_level = determineEscalationLevel(intent, text, confidence);

  const result: IntentResult = {
    intent,
    confidence,
    entities,
    context,
    subtype: null,
    dialogue_act,
    ui_component,
    needs_more_info: needsMoreInfo,
    follow_up: followUpQuestion,
    ai_response: aiResponse,
    escalation_level,
    cot_reasoning,
    validation_passed: true,
    validation_errors: [],
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

  // If the text contains actionable keywords, don't match as social
  // This prevents "Buenos días, necesito reprogramar" from being classified as greeting
  const hasActionableKeywords =
    INTENT_KEYWORDS[INTENT.CANCELAR_CITA]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.REAGENDAR]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.CONSULTAR_DISPONIBILIDAD]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.CREAR_CITA]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.VER_MIS_CITAS]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.ACTIVAR_RECORDATORIOS]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.DESACTIVAR_RECORDATORIOS]?.keywords.some(k => lower.includes(k));

  if (hasActionableKeywords && text.length > 30) return null;

  if (GREETINGS.some(g => lower === g)) return { intent: INTENT.SALUDO, confidence: SOCIAL_CONFIDENCE_VALUES.greeting_exact };
  if (GREETING_PHRASES.some(p => lower.includes(p))) return { intent: INTENT.SALUDO, confidence: SOCIAL_CONFIDENCE_VALUES.greeting_phrase };
  if (FAREWELLS.some(f => lower === f)) return { intent: INTENT.DESPEDIDA, confidence: SOCIAL_CONFIDENCE_VALUES.farewell_exact };
  if (FAREWELL_PHRASES.some(p => lower.includes(p))) return { intent: INTENT.DESPEDIDA, confidence: SOCIAL_CONFIDENCE_VALUES.farewell_phrase };
  if (THANK_YOU_WORDS.some(t => lower.includes(t)) && text.length < 20) return { intent: INTENT.AGRADECIMIENTO, confidence: SOCIAL_CONFIDENCE_VALUES.thank_you };
  if (OFF_TOPIC_PATTERNS.some(p => lower.includes(p))) return { intent: INTENT.PREGUNTA_GENERAL, confidence: SOCIAL_CONFIDENCE_VALUES.off_topic };
  return null;
}

interface LLMInquiryResult {
  readonly intent: IntentType;
  readonly confidence: number;
  readonly provider: "groq" | "openai";
  readonly cot_reasoning: string;
}

async function runLLMInquiryWithPrompt(systemPrompt: string, userMsg: string): Promise<[Error | null, LLMInquiryResult | null]> {
  try {
    const [callErr, response] = await callLLM(systemPrompt, userMsg);
    if (callErr != null || response == null) {
      return [callErr ?? new Error("LLM returned null response"), null];
    }

    const cleaned = sanitizeJSONResponse(response.content);
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const intent = parsed["intent"] as IntentType;
    const confidence = typeof parsed["confidence"] === "number" ? parsed["confidence"] : 0.5;

    return [null, {
      intent,
      confidence,
      provider: response.provider,
      cot_reasoning: "LLM with RAG context"
    }];
  } catch (e) {
    return [e instanceof Error ? e : new Error(String(e)), null];
  }
}
