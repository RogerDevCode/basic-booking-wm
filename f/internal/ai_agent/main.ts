// ============================================================================
// AI AGENT — Hybrid LLM + Rules Intent Classifier (v3.1)
// Pattern: Precision Architecture, No 'any', Errors as Values
// ============================================================================

import "@total-typescript/ts-reset";
import { INTENT, ESCALATION_THRESHOLDS } from './constants';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import {
  validateInput,
  verifyUrgency,
} from './guardrails';
import { trace } from './tracing';
import { classifyIntent } from './tfidf-classifier';
import { buildRAGContext } from './rag-context';
import {
  AIAgentInputSchema,
  type IntentResult,
  type IntentType,
  isIntentType
} from './types';
import {
  adjustIntentWithContext,
  extractEntities,
  detectContext,
  suggestResponseType,
  mapToDialogueAndUI,
  determineEscalationLevel,
  generateAIResponse,
  detectIntentRules,
  detectSocial,
  runLLMInquiryWithPrompt
} from './services';

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
  const { text, chat_id, provider_id: _provider_id, conversation_state } = input;

  // Step 1: Input guardrails
  const inputGuard = validateInput(text);
  if (inputGuard.kind === "blocked") {
    return { success: false, data: null, error_code: 'GUARDRAIL_BLOCKED', error_message: inputGuard.reason };
  }

  // Step 2: Intent detection
  let intent: IntentType = INTENT.DESCONOCIDO;
  let confidence = 0.0;
  let provider: "groq" | "openai" | "openrouter" | "fallback" | "fast-path" = "fallback";
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

  // Step 2.5: Context-aware intent adjustment
  // If the user is in an active flow, adjust intent based on conversation context
  const contextResult = adjustIntentWithContext(text, intent, confidence, conversation_state ?? null);
  if (contextResult.adjusted) {
    intent = contextResult.intent;
    confidence = contextResult.confidence;
    cot_reasoning = contextResult.reason;
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
    requires_human: escalation_level !== 'none',
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
