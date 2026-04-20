/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Test Gemini 2.5 Flash connectivity and basic Q&A via Google AI Studio
 * DB Tables Used  : None
 * Concurrency Risk: NO — single sequential HTTP calls
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only test queries
 * RLS Tenant ID   : NO — no DB access
 * Zod Schemas     : YES — all LLM responses validated before use
 */

// ============================================================================
// GEMINI 2.5 FLASH — Connectivity & Basic Q&A Test
// ============================================================================

import { z } from 'zod';
import type { Result } from '../internal/result/index';

// ============================================================================
// Types & Schemas
// ============================================================================

const GeminiCandidateSchema = z.object({
  content: z.object({
    parts: z.array(z.object({
      text: z.string(),
    })),
    role: z.string().optional(),
  }),
  finishReason: z.string().optional(),
  avgLogprobs: z.number().optional(),
});

const GeminiResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema).min(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    totalTokenCount: z.number().optional(),
  }).optional(),
  modelVersion: z.string().optional(),
});

type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

interface TestCase {
  readonly name: string;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly temperature: number;
  readonly jsonMode?: boolean;
}

interface TestResult {
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

interface TestReport {
  readonly model: string;
  readonly timestamp: string;
  readonly apiKeySet: boolean;
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly TestResult[];
}

// ============================================================================
// Google AI Studio Client
// ============================================================================

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKey(): Result<string> {
  const key = process.env['GOOGLE_API_KEY'];
  if (!key) {
    return [new Error('GOOGLE_API_KEY is not set in environment'), null];
  }
  return [null, key];
}

async function callGemini(
  apiKey: string,
  params: {
    readonly systemPrompt: string;
    readonly userMessage: string;
    readonly temperature?: number;
    readonly jsonMode?: boolean;
  }
): Promise<Result<GeminiResponse>> {
  const url = `${GEMINI_API_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: params.userMessage }],
    }],
    systemInstruction: {
      parts: [{ text: params.systemPrompt }],
    },
    generationConfig: {
      temperature: params.temperature ?? 0.0,
      maxOutputTokens: 1024,
      responseMimeType: params.jsonMode ? 'application/json' : 'text/plain',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return [
        new Error(`HTTP ${String(response.status)}: ${errorBody.slice(0, 500)}`),
        null,
      ];
    }

    const data: unknown = await response.json();
    const parsed = GeminiResponseSchema.safeParse(data);

    if (!parsed.success) {
      return [
        new Error(`Schema validation failed: ${parsed.error.message}`),
        null,
      ];
    }

    return [null, parsed.data];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`Network error: ${msg}`), null];
  }
}

// ============================================================================
// Test Suite Data
// ============================================================================

const TEST_CASES: readonly TestCase[] = [
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
    systemPrompt: `Clasifica el mensaje del usuario en uno de estos intents:
- ver_disponibilidad: quiere ver horarios disponibles
- crear_cita: quiere agendar una cita
- cancelar_cita: quiere cancelar una cita existente
- reagendar_cita: quiere mover una cita a otro horario
- mis_citas: quiere ver sus citas agendadas
- duda_general: saludo o pregunta genérica
- fuera_de_contexto: emergencia o tema fuera del sistema

Responde SOLO con JSON en este formato exacto:
{"intent":"<intent>","confidence":<0.0-1.0>,"requires_human":<true/false>}`,
    userMessage: 'Hola buenos días, quiero sacar una hora para la próxima semana',
    temperature: 0.0,
    jsonMode: true,
  },
  {
    name: '09_nlu_json_reschedule',
    systemPrompt: `Clasifica el mensaje del usuario en uno de estos intents:
- ver_disponibilidad: quiere ver horarios disponibles
- crear_cita: quiere agendar una cita
- cancelar_cita: quiere cancelar una cita existente
- reagendar_cita: quiere mover una cita a otro horario
- mis_citas: quiere ver sus citas agendadas
- duda_general: saludo o pregunta genérica
- fuera_de_contexto: emergencia o tema fuera del sistema

Responde SOLO con JSON en este formato exacto:
{"intent":"<intent>","confidence":<0.0-1.0>,"requires_human":<true/false>}`,
    userMessage: 'Oye, me equivoqué de día, puedo pasar mi cita del lunes al miércoles?',
    temperature: 0.0,
    jsonMode: true,
  },
];

// ============================================================================
// Utilities
// ============================================================================

function extractText(response: GeminiResponse): string {
  const first = response.candidates[0];
  if (!first) return '(no content)';
  return first.content.parts.map(p => p.text).join('').trim();
}

async function runSingleTest(testCase: TestCase, apiKey: string): Promise<Result<TestResult>> {
  const start = Date.now();

  const [err, response] = await callGemini(apiKey, {
    systemPrompt: testCase.systemPrompt,
    userMessage: testCase.userMessage,
    temperature: testCase.temperature,
    ...(testCase.jsonMode !== undefined ? { jsonMode: testCase.jsonMode } : {}),
  });

  const latencyMs = Date.now() - start;

  if (err !== null || response === null) {
    return [null, {
      name: testCase.name,
      success: false,
      response: null,
      error: err?.message ?? 'null response',
      tokenUsage: null,
      latencyMs,
      modelVersion: null,
    }];
  }

  const text = extractText(response);
  const usage = response.usageMetadata;

  return [null, {
    name: testCase.name,
    success: true,
    response: text,
    error: null,
    tokenUsage: {
      prompt: usage?.promptTokenCount ?? null,
      candidates: usage?.candidatesTokenCount ?? null,
      total: usage?.totalTokenCount ?? null,
    },
    latencyMs,
    modelVersion: response.modelVersion ?? null,
  }];
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export async function main(_rawInput: unknown = {}): Promise<Result<TestReport>> {
  const [keyErr, apiKey] = getApiKey();
  if (keyErr !== null) {
    return [new Error(`CONFIG_ERROR: ${keyErr.message}`), null];
  }
  if (apiKey === null) {
    return [new Error('CONFIG_ERROR: apiKey is null'), null];
  }

  printHeader();

  // ── Step 1: Connectivity Check ──────────────────────────────────────────
  console.log('[1/2] Testing API connectivity...');
  const [connErr, connResp] = await callGemini(apiKey, {
    systemPrompt: 'Reply with exactly: OK',
    userMessage: 'Ping',
  });

  if (connErr !== null) {
    return [new Error(`CONNECTIVITY_FAILED: ${connErr.message}`), null];
  }
  if (connResp === null) {
    return [new Error('CONNECTIVITY_FAILED: null response'), null];
  }
  console.log(`  ✓ Connected — Model: ${connResp.modelVersion ?? '(unknown)'}\n`);

  // ── Step 2: Run Test Suite ──────────────────────────────────────────────
  console.log(`[2/2] Running ${String(TEST_CASES.length)} test cases...\n`);

  const results: TestResult[] = [];
  for (const tc of TEST_CASES) {
    const [err, result] = await runSingleTest(tc, apiKey);
    if (err !== null || result === null) {
      console.log(`  ✗ ${tc.name}: FATAL RUNTIME ERROR`);
      continue;
    }
    results.push(result);
    printResultPreview(result);
  }

  const report = generateReport(results);
  printSummary(report);

  return [null, report];
}

// ============================================================================
// Formatting & Reporting
// ============================================================================

function printHeader(): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Gemini 2.5 Flash — Connectivity & Q&A Test`);
  console.log(`  Model: ${GEMINI_MODEL}`);
  console.log(`${'='.repeat(70)}\n`);
}

function printResultPreview(result: TestResult): void {
  if (result.success && result.response) {
    const preview = result.response.length > 120
      ? result.response.slice(0, 120).replace(/\n/g, ' ') + '...'
      : result.response.replace(/\n/g, ' ');
    console.log(`  ✓ ${result.name} (${String(result.latencyMs)}ms, ${String(result.tokenUsage?.total ?? '?')} tokens)`);
    console.log(`    → ${preview}`);
  } else {
    console.log(`  ✗ ${result.name}: ${String(result.error)}`);
  }
}

function generateReport(results: readonly TestResult[]): TestReport {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return Object.freeze({
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
    apiKeySet: true,
    totalTests: results.length,
    passed,
    failed,
    results,
  });
}

function printSummary(report: TestReport): void {
  const avgLatency = report.results.length > 0
    ? Math.round(report.results.reduce((sum, r) => sum + r.latencyMs, 0) / report.results.length)
    : 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log('='.repeat(70));
  console.log(`  Model        : ${report.model}`);
  console.log(`  Total tests  : ${String(report.totalTests)}`);
  console.log(`  Passed       : ${String(report.passed)}`);
  console.log(`  Failed       : ${String(report.failed)}`);
  console.log(`  Avg latency  : ${String(avgLatency)}ms`);
  console.log(`${'='.repeat(70)}\n`);
}

// ── CLI entry point ──────────────────────────────────────────────────────
const isMain = process.argv[1]?.endsWith('gemini_test/main.ts') ||
  import.meta.url?.endsWith('gemini_test/main.ts');

if (isMain) {
  void main().then(([err, report]) => {
    if (err !== null) {
      console.error(`\n❌ FATAL: ${err.message}`);
      process.exit(1);
    }
    if (report !== null) {
      console.log('Full report preview (first 2):', JSON.stringify(report.results.slice(0, 2), null, 2));
    }
    process.exit(report?.failed === 0 ? 0 : 1);
  });
}
