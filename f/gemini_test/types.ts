import { z } from 'zod';

export const GeminiCandidateSchema = z.object({
  content: z.object({
    parts: z.array(z.object({
      text: z.string(),
    })),
    role: z.string().optional(),
  }),
  finishReason: z.string().optional(),
  avgLogprobs: z.number().optional(),
});

export const GeminiResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema).min(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    totalTokenCount: z.number().optional(),
  }).optional(),
  modelVersion: z.string().optional(),
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

export interface TestCase {
  readonly name: string;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly temperature: number;
  readonly jsonMode?: boolean;
}

export interface TestResult {
  readonly name: string;
  readonly success: boolean;
  readonly response: string | null;
  readonly error: string | null;
  readonly tokenUsage: {
    readonly prompt: number | null;
    readonly candidates: number | null;
    readonly total: number | null;
  } | null;
  readonly latencyMs: number;
  readonly modelVersion: string | null;
}

export interface TestReport {
  readonly model: string;
  readonly timestamp: string;
  readonly apiKeySet: boolean;
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly TestResult[];
}

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const TEST_CASES: readonly TestCase[] = [
  {
    name: '01_basic_connectivity',
    systemPrompt: 'Eres un asistente útil. Responde brevemente.',
    userMessage: 'Hola, ¿cómo estás?',
    temperature: 0.0,
  },
  {
    name: '02_medical_greeting',
    systemPrompt: 'Eres el asistente de una clínica médica. Responde de forma profesional y empática en español.',
    userMessage: 'Hola, necesito agendar una consulta con el doctor.',
    temperature: 0.0,
  },
  {
    name: '03_availability_query',
    systemPrompt: 'Eres el motor de disponibilidad de una clínica médica. Solo responde con horarios disponibles.',
    userMessage: '¿Tienen hora disponible para el lunes por la mañana?',
    temperature: 0.0,
  },
  {
    name: '04_cancel_intent',
    systemPrompt: 'Eres el asistente de una clínica médica. Ayuda a los pacientes con sus citas.',
    userMessage: 'Quiero cancelar mi cita del próximo martes.',
    temperature: 0.0,
  },
  {
    name: '05_reschedule_intent',
    systemPrompt: 'Eres el asistente de una clínica médica. Ayuda a los pacientes con sus citas.',
    userMessage: 'Necesito cambiar mi cita para otro día, ¿puede ser el jueves?',
    temperature: 0.0,
  },
  {
    name: '06_urgency_detection',
    systemPrompt: 'Eres el asistente de una clínica médica. Si detectas una emergencia, indica que se contacte servicios de urgencia.',
    userMessage: 'Tengo un dolor muy fuerte en el pecho y no puedo respirar bien.',
    temperature: 0.0,
  },
  {
    name: '07_out_of_scope',
    systemPrompt: 'Eres el asistente de una clínica médica. Solo respondes preguntas sobre citas y servicios médicos.',
    userMessage: '¿Quién ganó el partido de fútbol ayer?',
    temperature: 0.0,
  },
  {
    name: '08_nlu_json_classification',
    systemPrompt: 'Responde SOLO con JSON válido: {"intent":"...","confidence":0.0,"requires_human":false}',
    userMessage: 'Quiero ver mis citas',
    temperature: 0.0,
    jsonMode: true,
  },
  {
    name: '09_context_retention',
    systemPrompt: 'Eres el asistente de una clínica médica con memoria.',
    userMessage: 'Mi nombre es Juan.',
    temperature: 0.0,
  },
  {
    name: '10_long_context',
    systemPrompt: 'Eres un asistente conciso.',
    userMessage: 'Explica la fotosíntesis en 3 oraciones.',
    temperature: 0.3,
  },
];