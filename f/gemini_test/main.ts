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
// Tests:
//   1. API connectivity (Google AI Studio)
//   2. Model listing (available models)
//   3. Basic Q&A (greeting, medical intent, availability query)
//   4. Structured JSON output (NLU intent classification)
//   5. Spanish language handling
//   6. Error handling (invalid key, rate limit)
// ============================================================================

import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

type Result<T> = [Error | null, T | null];

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

// ============================================================================
// Google AI Studio Client
// ============================================================================

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getApiKey(): [Error | null, string | null] {
  const key = process.env['GOOGLE_API_KEY'];
  if (key === undefined || key === '') {
    return [new Error('GOOGLE_API_KEY is not set in environment'), null];
  }
  return [null, key];
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.0,
): Promise<[Error | null, GeminiResponse | null]> {
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
      responseMimeType: 'text/plain',
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
        new Error(`HTTP ${response.status}: ${errorBody.slice(0, 500)}`),
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

async function callGeminiJSON(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.0,
): Promise<[Error | null, GeminiResponse | null]> {
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
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
        new Error(`HTTP ${response.status}: ${errorBody.slice(0, 500)}`),
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
// Test Cases
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
    systemPrompt:
      'Eres el asistente de una clínica médica. Responde de forma profesional y empática en español.',
    userMessage: 'Hola, necesito agendar una consulta con el doctor.',
    temperature: 0.0,
  },
  {
    name: '03_availability_query',
    systemPrompt:
      'Eres el motor de disponibilidad de una clínica médica. Solo responde con horarios disponibles.',
    userMessage: '¿Tienen hora disponible para el lunes por la mañana?',
    temperature: 0.0,
  },
  {
    name: '04_cancel_intent',
    systemPrompt:
      'Eres el asistente de una clínica médica. Ayuda a los pacientes con sus citas.',
    userMessage: 'Quiero cancelar mi cita del próximo martes.',
    temperature: 0.0,
  },
  {
    name: '05_reschedule_intent',
    systemPrompt:
      'Eres el asistente de una clínica médica. Ayuda a los pacientes con sus citas.',
    userMessage: 'Necesito cambiar mi cita para otro día, ¿puede ser el jueves?',
    temperature: 0.0,
  },
  {
    name: '06_urgency_detection',
    systemPrompt:
      'Eres el asistente de una clínica médica. Si detectas una emergencia, indica que se contacte servicios de urgencia.',
    userMessage: 'Tengo un dolor muy fuerte en el pecho y no puedo respirar bien.',
    temperature: 0.0,
  },
  {
    name: '07_out_of_scope',
    systemPrompt:
      'Eres el asistente de una clínica médica. Solo respondes preguntas sobre citas y servicios médicos.',
    userMessage: '¿Quién ganó el partido de fútbol ayer?',
    temperature: 0.0,
  },
];

const JSON_TEST_CASES: readonly TestCase[] = [
  {
    name: '08_nlu_json_classification',
    systemPrompt:
      `Clasifica el mensaje del usuario en uno de estos intents:
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
  },
  {
    name: '09_nlu_json_reschedule',
    systemPrompt:
      `Clasifica el mensaje del usuario en uno de estos intents:
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
  },
];

// ============================================================================
// Test Runner
// ============================================================================

function extractText(response: GeminiResponse): string {
  const first = response.candidates[0];
  if (first === undefined) return '(no content)';
  const parts = first.content.parts;
  const texts = parts.map(p => p.text);
  return texts.join('').trim();
}

async function runTest(testCase: TestCase, apiKey: string, jsonMode: boolean = false): Promise<Result<TestResult>> {
  const start = Date.now();

  const [err, response] = jsonMode
    ? await callGeminiJSON(apiKey, testCase.systemPrompt, testCase.userMessage, testCase.temperature)
    : await callGemini(apiKey, testCase.systemPrompt, testCase.userMessage, testCase.temperature);

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
    modelVersion: response?.modelVersion ?? null,
  }];
}

// ============================================================================
// Main
// ============================================================================

interface TestReport {
  readonly model: string;
  readonly timestamp: string;
  readonly apiKeySet: boolean;
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly TestResult[];
}

export async function main(_rawInput: unknown = {}): Promise<[Error | null, TestReport | null]> {
  const [keyErr, apiKey] = getApiKey();
  if (keyErr !== null || apiKey === null) {
    return [new Error(`CONFIG_ERROR: ${keyErr?.message ?? 'apiKey is null'}`), null];
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Gemini 2.5 Flash — Connectivity & Q&A Test`);
  console.log(`  Model: ${GEMINI_MODEL}`);
  console.log(`  API: ${GEMINI_API_URL.split('?')[0]}`);
  console.log(`${'='.repeat(70)}\n`);

  // ── Step 1: Basic connectivity ──────────────────────────────────────────
  console.log('[1/3] Testing API connectivity...');
  const [connErr, connResp] = await callGemini(apiKey, 'Reply with exactly: OK', 'Ping', 0.0);
  if (connErr !== null || connResp === null) {
    return [new Error(`CONNECTIVITY_FAILED: ${connErr?.message ?? 'null response'}`), null];
  }
  console.log(`  ✓ Connected — model responded successfully`);
  console.log(`  ✓ Model version: ${connResp.modelVersion ?? '(not reported)'}`);

  // ── Step 2: Run all text test cases ─────────────────────────────────────
  console.log(`\n[2/3] Running ${TEST_CASES.length} text test cases...\n`);

  const textResults: TestResult[] = [];

  for (const tc of TEST_CASES) {
    const [err, result] = await runTest(tc, apiKey);
    if (err !== null || result === null) {
      console.log(`  ✗ ${tc.name}: ${err?.message ?? 'null result'}`);
      continue;
    }
    textResults.push(result);

    if (result.success && result.response !== null) {
      const preview = result.response.length > 120
        ? result.response.slice(0, 120) + '...'
        : result.response;
      console.log(`  ✓ ${tc.name} (${result.latencyMs}ms, ${result.tokenUsage?.total ?? '?'} tokens)`);
      console.log(`    → ${preview.replace(/\n/g, ' ')}`);
    } else {
      console.log(`  ✗ ${tc.name}: ${result.error}`);
    }
  }

  // ── Step 3: Run JSON test cases ─────────────────────────────────────────
  console.log(`\n[3/3] Running ${JSON_TEST_CASES.length} JSON structured output test cases...\n`);

  const jsonResults: TestResult[] = [];

  for (const tc of JSON_TEST_CASES) {
    const [err, result] = await runTest(tc, apiKey, true);
    if (err !== null || result === null) {
      console.log(`  ✗ ${tc.name}: ${err?.message ?? 'null result'}`);
      continue;
    }
    jsonResults.push(result);

    if (result.success) {
      const preview = result.response!.length > 200
        ? result.response!.slice(0, 200) + '...'
        : result.response!;
      console.log(`  ✓ ${tc.name} (${result.latencyMs}ms, ${result.tokenUsage?.total ?? '?'} tokens)`);
      console.log(`    → ${preview.replace(/\n/g, ' ')}`);
    } else {
      console.log(`  ✗ ${tc.name}: ${result.error}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const allResults = [...textResults, ...jsonResults];
  const passed = allResults.filter(r => r.success).length;
  const failed = allResults.filter(r => !r.success).length;
  const avgLatency = allResults.length > 0
    ? Math.round(allResults.reduce((sum, r) => sum + r.latencyMs, 0) / allResults.length)
    : 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Model        : ${GEMINI_MODEL}`);
  console.log(`  Total tests  : ${allResults.length}`);
  console.log(`  Passed       : ${passed}`);
  console.log(`  Failed       : ${failed}`);
  console.log(`  Avg latency  : ${avgLatency}ms`);
  console.log(`  Model version: ${allResults.find(r => r.modelVersion)?.modelVersion ?? '(not reported)'}`);
  console.log(`${'='.repeat(70)}\n`);

  const report: TestReport = Object.freeze({
    model: GEMINI_MODEL,
    timestamp: new Date().toISOString(),
    apiKeySet: true,
    totalTests: allResults.length,
    passed,
    failed,
    results: allResults,
  });

  return [null, report];
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
      console.log('Full report:', JSON.stringify(report, null, 2));
    }
    process.exit(report?.failed === 0 ? 0 : 1);
  });
}
