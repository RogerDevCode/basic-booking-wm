// ============================================================================
// TYPED PROMPT ENGINEERING — Intent Classification Contracts (v3.1)
// Pattern: TypeScript.Page 2026 + CallSphere Agentic AI
// Zero mocks, zero hardcoded data, zero hardcoded credentials
// ============================================================================

import { z } from "zod";
import { INTENT } from "./constants";

// ============================================================================
// ZOD SCHEMAS — Single Source of Truth (CallSphere 2026)
// NUNCA definir interfaces separadas. Todo tipo se infiere con z.infer<>
// ============================================================================

export const AIAgentInputSchema = z.object({
  chat_id: z.string().min(1).describe("Identificador único del chat/paciente"),
  text: z.string().trim().min(1).max(500).describe("Mensaje del usuario"),
  provider_id: z.string().uuid().optional().describe("ID del proveedor/contexto del consultorio"),
  user_profile: z.object({
    is_first_time: z.boolean().describe("Si es la primera interacción"),
    booking_count: z.number().int().min(0).describe("Número de citas previas"),
  }).optional().describe("Perfil del usuario para respuestas contextualizadas"),
}).readonly();

export const EntityMapSchema = z.object({
  date: z.string().nullable().catch(null),
  time: z.string().nullable().catch(null),
  provider_name: z.string().nullable().catch(null),
  provider_id: z.string().nullable().catch(null),
  service_type: z.string().nullable().catch(null),
  service_id: z.string().nullable().catch(null),
  booking_id: z.string().nullable().catch(null),
  channel: z.string().nullable().catch(null),
  reminder_window: z.string().nullable().catch(null),
}).catchall(z.string()).readonly();

export const AvailabilityContextSchema = z.object({
  is_today: z.boolean(),
  is_tomorrow: z.boolean(),
  is_urgent: z.boolean(),
  is_flexible: z.boolean(),
  is_specific_date: z.boolean(),
  time_preference: z.enum(["morning", "afternoon", "evening", "any"]),
  day_preference: z.string().nullable(),
}).readonly();

export const IntentResultSchema = z.object({
  intent: z.enum(Object.values(INTENT) as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  entities: EntityMapSchema,
  context: AvailabilityContextSchema,
  suggested_response_type: z.string().min(1),
  ai_response: z.string().min(1),
  needs_more_info: z.boolean(),
  follow_up_question: z.string().nullable().catch(null),
  cot_reasoning: z.string().min(1),
  validation_passed: z.boolean(),
  validation_errors: z.array(z.string()),
}).readonly();

// ============================================================================
// INFERRED TYPES — NUNCA duplicar manualmente
// ============================================================================

export type AIAgentInput = Readonly<z.infer<typeof AIAgentInputSchema>>;
export type EntityMap = Readonly<z.infer<typeof EntityMapSchema>>;
export type AvailabilityContext = Readonly<z.infer<typeof AvailabilityContextSchema>>;
export type IntentResult = Readonly<z.infer<typeof IntentResultSchema>>;
export type IntentType = typeof INTENT[keyof typeof INTENT];

// ============================================================================
// DISCRIMINATED UNIONS — Error handling exhaustivo (CallSphere 2026)
// El compiler enforce que todos los casos se manejen
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
// PROMPT SPEC — Typed Prompt Engineering (TypeScript.Page 2026)
// ============================================================================

export interface PromptSpec<I, O> {
  readonly name: string;
  readonly version: string;
  readonly systemPrompt: (input: I) => string;
  readonly outputSchema: z.ZodType<O>;
}

export const IntentClassifierSpec: PromptSpec<{ readonly userMessage: string; readonly ragContext?: string }, IntentResult> = {
  name: "intent_classifier",
  version: "1.0",
  systemPrompt: () => "", // Se construye dinámicamente en prompt-builder.ts
  outputSchema: IntentResultSchema,
};

// ============================================================================
// TYPE GUARDS — Validación runtime ligera (TypeScript.Page 2026)
// ============================================================================

export function isIntentType(value: string): value is IntentType {
  return (Object.values(INTENT) as string[]).includes(value);
}

export function isValidConfidence(value: number): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

export function isUrgentIntent(intent: IntentType): boolean {
  return intent === INTENT.URGENT_CARE;
}

export function isBookingIntent(intent: IntentType): boolean {
  return [
    INTENT.CREATE_APPOINTMENT,
    INTENT.CANCEL_APPOINTMENT,
    INTENT.RESCHEDULE,
    INTENT.CHECK_AVAILABILITY,
  ].includes(intent);
}
