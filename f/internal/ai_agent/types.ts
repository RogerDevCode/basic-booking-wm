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
  user_profile: z.object({
    is_first_time: z.boolean().describe("Si es la primera interacción"),
    booking_count: z.number().int().min(0).describe("Número de citas previas"),
  }).optional().describe("Perfil del usuario para respuestas contextualizadas"),
});

export const EntityMapSchema = z.object({
  date: z.string().nullable().describe("Fecha relativa o absoluta extraída"),
  time: z.string().nullable().describe("Hora preferida"),
  provider_name: z.string().nullable().describe("Nombre del profesional"),
  provider_id: z.string().nullable().describe("ID del proveedor"),
  service_type: z.string().nullable().describe("Tipo de servicio"),
  service_id: z.string().nullable().describe("ID del servicio"),
  booking_id: z.string().nullable().describe("ID de reserva existente"),
  channel: z.string().nullable().describe("Canal de notificación (telegram, gmail, email, ambos)"),
  reminder_window: z.string().nullable().describe("Ventana de recordatorio (24h, 2h, 30min)"),
});

export const AvailabilityContextSchema = z.object({
  is_today: z.boolean(),
  is_tomorrow: z.boolean(),
  is_urgent: z.boolean(),
  is_flexible: z.boolean(),
  is_specific_date: z.boolean(),
  time_preference: z.enum(["morning", "afternoon", "evening", "any"]),
  day_preference: z.string().nullable(),
});

export const IntentResultSchema = z.object({
  intent: z.enum(Object.values(INTENT) as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  entities: EntityMapSchema,
  context: AvailabilityContextSchema,
  suggested_response_type: z.string(),
  ai_response: z.string(),
  needs_more_info: z.boolean(),
  follow_up_question: z.string().nullable(),
  cot_reasoning: z.string().describe("Razonamiento del LLM o motivo de fallback"),
  validation_passed: z.boolean(),
  validation_errors: z.array(z.string()),
});

// ============================================================================
// INFERRED TYPES — NUNCA duplicar manualmente
// ============================================================================

export type AIAgentInput = z.infer<typeof AIAgentInputSchema>;
export type EntityMap = z.infer<typeof EntityMapSchema>;
export type AvailabilityContext = z.infer<typeof AvailabilityContextSchema>;
export type IntentResult = z.infer<typeof IntentResultSchema>;
export type IntentType = typeof INTENT[keyof typeof INTENT];

// ============================================================================
// DISCRIMINATED UNIONS — Error handling exhaustivo (CallSphere 2026)
// El compiler enforce que todos los casos se manejen
// ============================================================================

export type LLMCallResult =
  | { kind: "success"; content: string; provider: "groq" | "openai"; tokens_in: number; tokens_out: number; latency_ms: number }
  | { kind: "provider_error"; error: string; provider: "groq" | "openai"; retry_count: number }
  | { kind: "no_provider"; error: "No LLM API keys configured" };

export type GuardrailResult =
  | { kind: "pass" }
  | { kind: "blocked"; reason: string; category: "injection" | "unicode" | "length" | "leakage" };

export type ClassificationResult =
  | { kind: "llm_classified"; intent: IntentType; confidence: number; provider: string }
  | { kind: "rule_classified"; intent: IntentType; confidence: number; reason: string }
  | { kind: "unknown"; confidence: number };

// ============================================================================
// PROMPT SPEC — Typed Prompt Engineering (TypeScript.Page 2026)
// ============================================================================

export interface PromptSpec<I, O> {
  name: string;
  version: string;
  systemPrompt: (input: I) => string;
  outputSchema: z.ZodType<O>;
}

export const IntentClassifierSpec: PromptSpec<{ userMessage: string; ragContext?: string }, IntentResult> = {
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
