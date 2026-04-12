// ============================================================================
// TYPED PROMPT ENGINEERING — Intent Classification Contracts (v4.0)
// Pattern: TypeScript.Page 2026 + CallSphere Agentic AI
// Red Team corrections applied:
//   1. Discriminated unions per intent (subtype constrained by intent parent)
//   2. Conversation state in input (resolves implicit references)
//   3. Separated dialogue_act from ui_component (ISO 22446 compliance)
//   4. Confidence semantics defined (calibrated probability)
//   5. Escalation thresholds explicit (no ambiguous boolean flags)
// ============================================================================

import { z } from "zod";
import { INTENT, CONFIDENCE_BOUNDARIES } from "./constants";

// ============================================================================
// ZOD SCHEMAS — Single Source of Truth
// ============================================================================

// ── Conversation State (input context) ───────────────────────────────────

export const ConversationStateSchema = z.object({
  previous_intent: z.string().nullable().catch(null),
  active_flow:     z.enum(["booking_wizard", "reschedule_flow", "cancellation_flow", "reminder_flow", "selecting_specialty", "selecting_datetime", "none"]).default("none"),
  flow_step:       z.number().int().min(0).default(0),
  pending_data:    z.record(z.string(), z.unknown()).default({}),
  last_user_utterance: z.string().nullable().catch(null),
}).readonly();

export type ConversationState = Readonly<z.infer<typeof ConversationStateSchema>>;

// ── Input ─────────────────────────────────────────────────────────────────

export const AIAgentInputSchema = z.object({
  chat_id: z.string().min(1).describe("Identificador único del chat/paciente"),
  text: z.string().trim().min(1).max(500).describe("Mensaje del usuario"),
  provider_id: z.string().uuid().optional().describe("ID del proveedor/contexto del consultorio"),
  conversation_state: ConversationStateSchema.optional().describe("Estado actual del diálogo"),
  user_profile: z.object({
    is_first_time: z.boolean().describe("Si es la primera interacción"),
    booking_count: z.number().int().min(0).describe("Número de citas previas"),
  }).optional().describe("Perfil del usuario para respuestas contextualizadas"),
}).readonly();

// ── Entities ──────────────────────────────────────────────────────────────

export const EntityMapSchema = z.object({
  date:            z.string().nullable().catch(null),
  time:            z.string().nullable().catch(null),
  provider_name:   z.string().nullable().catch(null),
  provider_id:     z.string().nullable().catch(null),
  service_type:    z.string().nullable().catch(null),
  service_id:      z.string().nullable().catch(null),
  booking_id:      z.string().nullable().catch(null),
  channel:         z.string().nullable().catch(null),
  reminder_window: z.string().nullable().catch(null),
}).catchall(z.string().nullable()).readonly();

// ── Context ───────────────────────────────────────────────────────────────

export const AvailabilityContextSchema = z.object({
  is_today:         z.boolean(),
  is_tomorrow:      z.boolean(),
  is_urgent:        z.boolean(),
  is_flexible:      z.boolean(),
  is_specific_date: z.boolean(),
  time_preference:  z.enum(["morning", "afternoon", "evening", "any"]),
  day_preference:   z.string().nullable(),
}).readonly();

// ── Subtypes (discriminated by intent parent) ────────────────────────────

/**
 * SocialSubtype — válido SOLO cuando intent === "interaccion_social"
 * Según ISO 22446: saludo inicia sesión, despedida la cierra,
 * agradecimiento mantiene el estado actual.
 */
export const SocialSubtypeSchema = z.enum(["saludo", "despedida", "agradecimiento"]);

/**
 * ReminderSubtype — válido SOLO cuando intent === "gestion_recordatorios"
 */
export const ReminderSubtypeSchema = z.enum(["activar", "desactivar", "preferencias"]);

/**
 * NavSubtype — válido SOLO cuando intent === "navegacion"
 */
export const NavSubtypeSchema = z.enum(["menu", "siguiente", "atras", "confirmar"]);

// ── Dialogue Act (ISO 22446 compliant) ────────────────────────────────────

/**
 * Qué tipo de acto de habla representa la respuesta.
 * Ortogonal al contenido semántico del intent.
 * Ver: ISO 22446:2022 — Framework for Dialogue Act Annotation
 */
export const DialogueActSchema = z.enum([
  "inform",          // proporcionar información
  "question",        // hacer una pregunta
  "request_action",  // pedir acción del usuario
  "confirm",         // confirmar algo
  "acknowledge",     // reconocer entrada del usuario
  "offer",           // ofrecer opciones
  "close",           // cerrar la conversación
]);

export type DialogueAct = z.infer<typeof DialogueActSchema>;

// ── UI Component (rendering layer, channel-agnostic) ─────────────────────

/**
 * Qué tipo de componente de UI se sugiere para la respuesta.
 * El canal específico (Telegram, WhatsApp, web) decide cómo renderizarlo.
 */
export const UIComponentSchema = z.enum([
  "text_message",      // solo texto
  "quick_replies",     // texto + botones de respuesta rápida
  "form_card",         // formulario con campos
  "list_card",         // lista de items (slots, citas)
  "confirmation_card", // card de confirmación con detalles
  "warning_card",      // card de advertencia (urgencia, error)
  "menu_card",         // menú de opciones
]);

export type UIComponent = z.infer<typeof UIComponentSchema>;

// ── Escalation Level ──────────────────────────────────────────────────────

/**
 * Nivel de escalado requerido.
 * Reemplaza los dos flags ambiguos (requires_human_escalation, is_medical_emergency)
 * con niveles claros y accionables.
 */
export const EscalationLevelSchema = z.enum([
  "none",            // manejo automático completo
  "priority_queue",  // cola prioritaria (usuario frustrado, sin emergencia médica)
  "human_handoff",   // transferencia a humano (caso no resoluble automáticamente)
  "medical_emergency", // emergencia médica — contactar servicios de urgencia
]);

export type EscalationLevel = z.infer<typeof EscalationLevelSchema>;

// ── Intent Result (discriminated union by intent) ─────────────────────────

/**
 * Schema base compartido por todos los intents.
 * Los campos subtype, dialogue_act, y escalation_level tienen valores
 * por defecto que se sobrescriben según el intent específico.
 */
const BaseIntentResultSchema = z.object({
  intent:     z.enum(Object.values(INTENT) as [string, ...string[]]),
  confidence: z.number().min(0).max(1).describe(
    "Probabilidad calibrada del intent. " +
    "≥0.85 = alta certeza (fast-path), " +
    "0.60-0.84 = certeza moderada (LLM validation), " +
    "<0.60 = baja certeza (fallback rule-based + human review)"
  ),
  entities:       EntityMapSchema,
  context:        AvailabilityContextSchema,
  subtype:        z.union([SocialSubtypeSchema, ReminderSubtypeSchema, NavSubtypeSchema]).nullable().default(null),
  dialogue_act:   DialogueActSchema.default("inform"),
  ui_component:   UIComponentSchema.default("text_message"),
  needs_more_info: z.boolean().default(false),
  follow_up:      z.string().nullable().catch(null),
  ai_response:    z.string().min(1),
  requires_human: z.boolean().default(false),
  escalation_level: EscalationLevelSchema.default("none"),
  cot_reasoning:  z.string().min(1),
  validation_passed: z.boolean(),
  validation_errors: z.array(z.string()),
}).readonly();

export const IntentResultSchema = BaseIntentResultSchema;

// ============================================================================
// INFERRED TYPES — NUNCA duplicar manualmente
// ============================================================================

export type AIAgentInput = Readonly<z.infer<typeof AIAgentInputSchema>>;
export type EntityMap = Readonly<z.infer<typeof EntityMapSchema>>;
export type AvailabilityContext = Readonly<z.infer<typeof AvailabilityContextSchema>>;
export type IntentResult = Readonly<z.infer<typeof IntentResultSchema>>;
export type IntentType = typeof INTENT[keyof typeof INTENT];
export type SocialSubtype = z.infer<typeof SocialSubtypeSchema>;
export type ReminderSubtype = z.infer<typeof ReminderSubtypeSchema>;
export type NavSubtype = z.infer<typeof NavSubtypeSchema>;

// ============================================================================
// DISCRIMINATED UNIONS — Error handling exhaustivo
// ============================================================================

export type LLMCallResult =
  | { readonly kind: "success"; readonly content: string; readonly provider: "groq" | "openai"; readonly tokens_in: number; readonly tokens_out: number; readonly latency_ms: number }
  | { readonly kind: "provider_error"; readonly error: string; readonly provider: "groq" | "openai"; readonly retry_count: number }
  | { readonly kind: "no_provider"; readonly error: string };

export type GuardrailResult =
  | { readonly kind: "pass" }
  | { readonly kind: "blocked"; readonly reason: string; readonly category: "injection" | "unicode" | "length" | "leakage" };

export type ClassificationResult =
  | { readonly kind: "llm_classified"; readonly intent: IntentType; readonly confidence: number; readonly provider: string }
  | { readonly kind: "rule_classified"; readonly intent: IntentType; readonly confidence: number; readonly reason: string }
  | { readonly kind: "unknown"; readonly confidence: number };

// ============================================================================
// PROMPT SPEC
// ============================================================================

export interface PromptSpec<I, O> {
  readonly name: string;
  readonly version: string;
  readonly systemPrompt: (input: I) => string;
  readonly outputSchema: z.ZodType<O>;
}

export const IntentClassifierSpec: PromptSpec<{ readonly userMessage: string; readonly conversationState?: ConversationState; readonly ragContext?: string }, IntentResult> = {
  name: "intent_classifier",
  version: "4.0",
  systemPrompt: () => "", // Se construye dinámicamente en prompt-builder.ts
  outputSchema: IntentResultSchema,
};

// ============================================================================
// TYPE GUARDS — Validación runtime ligera
// ============================================================================

export function isIntentType(value: string): value is IntentType {
  return (Object.values(INTENT) as string[]).includes(value);
}

export function isValidConfidence(value: number): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/** Confidence ≥ CONFIDENCE_BOUNDARIES.HIGH_MIN — safe for fast-path without LLM validation */
export function isHighConfidence(confidence: number): boolean {
  return confidence >= CONFIDENCE_BOUNDARIES.HIGH_MIN;
}

/** Confidence CONFIDENCE_BOUNDARIES.MODERATE_MIN to MODERATE_MAX — moderate, LLM validation recommended */
export function isModerateConfidence(confidence: number): boolean {
  return confidence >= CONFIDENCE_BOUNDARIES.MODERATE_MIN && confidence < CONFIDENCE_BOUNDARIES.MODERATE_MAX;
}

/** Confidence < CONFIDENCE_BOUNDARIES.LOW_MAX — low, fallback to rule-based + human review */
export function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_BOUNDARIES.LOW_MAX;
}

export function isUrgentIntent(intent: IntentType): boolean {
  return intent === INTENT.URGENCIA;
}

export function isBookingIntent(intent: IntentType): boolean {
  return [
    INTENT.CREAR_CITA,
    INTENT.CANCELAR_CITA,
    INTENT.REAGENDAR_CITA,
    INTENT.VER_DISPONIBILIDAD,
  ].includes(intent);
}

// ============================================================================
// LLM OUTPUT SCHEMAS
// ============================================================================

export const LLMOutputSchema = z.object({
  intent: z.string().min(1),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    date:         z.string().nullable().optional(),
    time:         z.string().nullable().optional(),
    booking_id:   z.string().nullable().optional(),
    client_name:  z.string().nullable().optional(),
    service_type: z.string().nullable().optional(),
  }).optional().default({}),
  needs_more: z.boolean().optional().default(false),
  follow_up:  z.string().nullable().optional(),
}).readonly();

export type LLMOutput = z.infer<typeof LLMOutputSchema>;

export const LLMRawAPIResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ).min(1),
  usage: z.object({
    prompt_tokens:     z.number().int().optional(),
    completion_tokens: z.number().int().optional(),
  }).optional(),
}).readonly();

export type LLMRawAPIResponse = z.infer<typeof LLMRawAPIResponseSchema>;
