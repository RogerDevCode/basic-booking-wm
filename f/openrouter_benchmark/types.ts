import { z } from 'zod';

export type Result<T> = [Error | null, T | null];

export interface ModelCandidate {
  readonly id: string;
  readonly name: string;
  readonly contextWindow?: number;
}

export const MODELS: readonly ModelCandidate[] = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)' },
  { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B (free)' },
  { id: 'openrouter/auto:free', name: 'OpenRouter Auto (free router)' },
];

export const OpenRouterResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
        role: z.string().optional(),
      }),
      finish_reason: z.string().optional(),
    }),
  ).min(1),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(),
}).loose();

export type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

export const NLUIntentSchema = z.object({
  intent: z.string(),
  confidence: z.number(),
  requires_human: z.boolean(),
});

export type NLUIntent = z.infer<typeof NLUIntentSchema>;

export interface TaskPrompt {
  readonly name: string;
  readonly userMessage: string;
  readonly expectedIntent: string;
  readonly expectedHuman: boolean;
}

export interface ModelTestResult {
  readonly model: string;
  readonly taskId: string;
  readonly success: boolean;
  readonly rawResponse: string | null;
  readonly parsed: NLUIntent | null;
  readonly error: string | null;
  readonly correct: boolean | null;
  readonly latencyMs: number;
  readonly totalTokens: number | null;
}

export interface ModelSummary {
  readonly model: string;
  readonly totalTasks: number;
  readonly passed: number;
  readonly failed: number;
  readonly correct: number;
  readonly avgLatencyMs: number;
  readonly results: readonly ModelTestResult[];
}

export interface BenchmarkReport {
  readonly timestamp: string;
  readonly modelsTested: number;
  readonly summaries: readonly ModelSummary[];
}

export const SYSTEM_PROMPT = `Eres el Motor de Enrutamiento NLU de un SaaS médico.
Tu ÚNICA salida permitida es un objeto JSON puro con estas claves:
{"intent":"<intent>","confidence":<0.0-1.0>,"requires_human":<true/false>}

VALORES VÁLIDOS PARA "intent":
  "ver_disponibilidad"  → el usuario quiere ver horarios disponibles
  "crear_cita"          → el usuario quiere agendar una cita
  "cancelar_cita"       → el usuario quiere cancelar una cita existente
  "reagendar_cita"      → el usuario quiere mover una cita a otro horario
  "mis_citas"           → el usuario quiere ver sus citas agendadas
  "duda_general"        → saludo, pregunta genérica, o intención no reconocida
  "fuera_de_contexto"   → emergencia vital o tema completamente fuera del sistema

Sin markdown, sin explicaciones, sin preámbulo. SOLO JSON válido.`;

export const TASKS: readonly TaskPrompt[] = [
  {
    name: 'create_cita',
    userMessage: 'Hola, quiero agendar una cita para la próxima semana con el doctor García.',
    expectedIntent: 'crear_cita',
    expectedHuman: false,
  },
  {
    name: 'cancelar_cita',
    userMessage: 'Necesito cancelar mi cita del martes que viene, ya no puedo ir.',
    expectedIntent: 'cancelar_cita',
    expectedHuman: false,
  },
  {
    name: 'reagendar_cita',
    userMessage: 'Me equivoqué de día, puedo cambiar mi cita del lunes al jueves?',
    expectedIntent: 'reagendar_cita',
    expectedHuman: false,
  },
  {
    name: 'ver_disponibilidad',
    userMessage: '¿Tienen hora libre para el lunes por la mañana?',
    expectedIntent: 'ver_disponibilidad',
    expectedHuman: false,
  },
  {
    name: 'urgencia_medica',
    userMessage: 'Tengo un dolor muy fuerte en el pecho y me cuesta respirar, ayúdenme!',
    expectedIntent: 'fuera_de_contexto',
    expectedHuman: true,
  },
  {
    name: 'saludo_general',
    userMessage: 'Hola buenos días, cómo están?',
    expectedIntent: 'duda_general',
    expectedHuman: false,
  },
  {
    name: 'fuera_contexto',
    userMessage: '¿Quién ganó el partido de anoche?',
    expectedIntent: 'fuera_de_contexto',
    expectedHuman: false,
  },
  {
    name: 'mis_citas',
    userMessage: 'Quiero ver todas mis citas agendadas, no me acuerdo cuándo tengo.',
    expectedIntent: 'mis_citas',
    expectedHuman: false,
  },
];