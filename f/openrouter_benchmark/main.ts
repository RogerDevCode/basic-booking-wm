/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Test multiple OpenRouter free models for NLU intent classification
 * DB Tables Used  : None
 * Concurrency Risk: NO — sequential HTTP calls
 * GCal Calls      : NO
 * Idempotency Key : NO — read-only test queries
 * RLS Tenant ID   : NO — no DB access
 * Zod Schemas     : YES — all LLM responses validated
 */

// ============================================================================
// OPENROUTER FREE MODELS — NLU Intent Classification Benchmark
// ============================================================================
// Tests multiple free models on OpenRouter against a fixed set of
// NLU classification tasks relevant to the medical booking system.
// Each model gets the SAME 5 prompts + JSON response.
// ============================================================================

import { z } from 'zod';

// ============================================================================
// Types & Schemas
// ============================================================================

type Result<T> = [Error | null, T | null];

interface ModelCandidate {
  readonly id: string;
  readonly name: string;
  readonly contextWindow?: number;
}

// Free models on OpenRouter — curated for NLU benchmarking
const MODELS: readonly ModelCandidate[] = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (free)' },
  { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B (free)' },
  { id: 'openrouter/auto:free', name: 'OpenRouter Auto (free router)' },
];

const OpenRouterResponseSchema = z.object({
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

type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

const NLUIntentSchema = z.object({
  intent: z.string(),
  confidence: z.number(),
  requires_human: z.boolean(),
});

type NLUIntent = z.infer<typeof NLUIntentSchema>;

interface TaskPrompt {
  readonly name: string;
  readonly userMessage: string;
  readonly expectedIntent: string;
  readonly expectedHuman: boolean;
}

interface ModelTestResult {
  readonly model: string;
  readonly taskId: string;
  readonly success: boolean;
  readonly rawResponse: string | null;
  readonly parsed: NLUIntent | null;
  readonly error: string | null;
  readonly correct: boolean | null;  // null if parse failed
  readonly latencyMs: number;
  readonly totalTokens: number | null;
}

interface ModelSummary {
  readonly model: string;
  readonly totalTasks: number;
  readonly passed: number;
  readonly failed: number;
  readonly correct: number;
  readonly avgLatencyMs: number;
  readonly results: readonly ModelTestResult[];
}

// ============================================================================
// NLU Tasks — Fixed benchmark set
// ============================================================================

const SYSTEM_PROMPT = `Eres el Motor de Enrutamiento NLU de un SaaS médico.
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

const TASKS: readonly TaskPrompt[] = [
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

// ============================================================================
// OpenRouter Client
// ============================================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): [Error | null, string | null] {
  const key = process.env['OPENROUTER_API_KEY'];
  if (key === undefined || key === '') {
    return [new Error('OPENROUTER_API_KEY is not set'), null];
  }
  return [null, key];
}

async function callOpenRouter(
  apiKey: string,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  temperature = 0.0,
): Promise<[Error | null, OpenRouterResponse | null]> {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'Windmill Medical Booking Test',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature,
        max_tokens: 256,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return [
        new Error(`HTTP ${String(response.status)}: ${errorBody.slice(0, 500)}`),
        null,
      ];
    }

    const data: unknown = await response.json();
    const parsed = OpenRouterResponseSchema.safeParse(data);

    if (!parsed.success) {
      return [
        new Error(`Schema validation: ${parsed.error.message}`),
        null,
      ];
    }

    return [null, parsed.data];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`Network: ${msg}`), null];
  }
}

// ============================================================================
// JSON Extractor — handles markdown code fences
// ============================================================================

function extractJSON(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    const obj: unknown = JSON.parse(text);
    if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
  } catch { /* fall through */ }

  // Try extracting from markdown code fences
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  if (fenceMatch !== null) {
    try {
      const content = fenceMatch[1];
      if (content === undefined) return null;
      const obj: unknown = JSON.parse(content.trim());
      if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  // Try finding first JSON-like object
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (jsonMatch !== null) {
    try {
      const obj: unknown = JSON.parse(jsonMatch[0]);
      if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  return null;
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTaskForModel(
  apiKey: string,
  model: ModelCandidate,
  task: TaskPrompt,
): Promise<Result<ModelTestResult>> {
  const start = Date.now();

  const [err, response] = await callOpenRouter(
    apiKey,
    model.id,
    SYSTEM_PROMPT,
    task.userMessage,
    0.0,
  );

  const latencyMs = Date.now() - start;

  if (err !== null) {
    return [null, {
      model: model.name,
      taskId: task.name,
      success: false,
      rawResponse: null,
      parsed: null,
      error: err.message,
      correct: null,
      latencyMs,
      totalTokens: null,
    }];
  }

  const content = response?.choices[0]?.message?.content ?? '(no content)';
  const usage = response?.usage;

  // Try to parse JSON response
  const json = extractJSON(content);
  if (json === null) {
    return [null, {
      model: model.name,
      taskId: task.name,
      success: true,
      rawResponse: content,
      parsed: null,
      error: 'Failed to parse JSON from response',
      correct: false,
      latencyMs,
      totalTokens: usage?.total_tokens ?? null,
    }];
  }

  const validated = NLUIntentSchema.safeParse(json);
  if (!validated.success) {
    return [null, {
      model: model.name,
      taskId: task.name,
      success: true,
      rawResponse: content,
      parsed: null,
      error: `Schema mismatch: ${validated.error.message}`,
      correct: false,
      latencyMs,
      totalTokens: usage?.total_tokens ?? null,
    }];
  }

  const parsed = validated.data;
  const correct = parsed.intent === task.expectedIntent &&
    parsed.requires_human === task.expectedHuman;

  return [null, {
    model: model.name,
    taskId: task.name,
    success: true,
    rawResponse: content,
    parsed,
    error: null,
    correct,
    latencyMs,
    totalTokens: usage?.total_tokens ?? null,
  }];
}

// ============================================================================
// Main
// ============================================================================

interface BenchmarkReport {
  readonly timestamp: string;
  readonly modelsTested: number;
  readonly summaries: readonly ModelSummary[];
}

export async function main(_rawInput: unknown = {}): Promise<[Error | null, BenchmarkReport | null]> {
  const [keyErr, apiKey] = getApiKey();
  if (keyErr !== null || apiKey === null) {
    return [new Error(`CONFIG: ${keyErr?.message ?? 'apiKey null'}`), null];
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  OpenRouter Free Models — NLU Intent Classification Benchmark`);
  console.log(`  Tasks: ${String(TASKS.length)} | Models: ${String(MODELS.length)}`);
  console.log(`${'='.repeat(72)}\n`);

  const allSummaries: ModelSummary[] = [];

  for (const model of MODELS) {
    console.log(`\n${'─'.repeat(72)}`);
    console.log(`  Model: ${model.name} (${model.id})`);
    console.log('─'.repeat(72));

    const results: ModelTestResult[] = [];

    for (const task of TASKS) {
      const [err, result] = await runTaskForModel(apiKey, model, task);
      if (err !== null || result === null) {
        console.log(`  ✗ ${task.name}: ${err?.message ?? 'null'}`);
        continue;
      }
      results.push(result);

      if (result.success && result.correct !== null) {
        const icon = result.correct ? '✓' : '✗';
        const intentInfo = result.parsed !== null
          ? `${result.parsed.intent} (conf: ${String(result.parsed.confidence)})`
          : '(parse failed)';
        const tokens = result.totalTokens ?? '?';
        console.log(`  ${icon} ${task.name} — ${intentInfo} | ${String(result.latencyMs)}ms | ${String(tokens)} tok`);
        if (!result.correct && result.error !== null) {
          console.log(`    → ${result.error}`);
        }
      } else if (result.success && result.correct === null) {
        console.log(`  ✗ ${task.name}: ${String(result.error)} | ${String(result.latencyMs)}ms`);
        console.log(`    → ${result.rawResponse?.slice(0, 120) ?? '(empty)'}`);
      } else {
        console.log(`  ✗ ${task.name}: ${String(result.error)} | ${String(result.latencyMs)}ms`);
      }
    }

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const correct = results.filter(r => r.correct === true).length;
    const avgLatency = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
      : 0;

    console.log(`\n  Summary: ${String(correct)}/${String(results.length)} correct | ${String(passed)} ok | ${String(failed)} err | ${String(avgLatency)}ms avg`);

    allSummaries.push(Object.freeze({
      model: model.name,
      totalTasks: results.length,
      passed,
      failed,
      correct,
      avgLatencyMs: avgLatency,
      results,
    }));
  }

  // ── Final Summary Table ────────────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(72)}`);
  console.log(`  FINAL BENCHMARK RESULTS`);
  console.log('═'.repeat(72));
  console.log(`  ${'Model'.padEnd(35)} ${'Correct'.padEnd(10)} ${'Avg ms'.padEnd(10)} Status`);
  console.log(`  ${'─'.repeat(35)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`);

  for (const s of allSummaries) {
    const pct = `${String(s.correct)}/${String(s.totalTasks)}`;
    const status = s.failed > 2 ? '🔴 FAIL' : s.correct === s.totalTasks ? '🟢 OK' : '🟡 PARTIAL';
    console.log(`  ${s.model.padEnd(35)} ${pct.padEnd(10)} ${String(s.avgLatencyMs).padEnd(10)} ${status}`);
  }

  console.log(`${'═'.repeat(72)}\n`);

  const report: BenchmarkReport = Object.freeze({
    timestamp: new Date().toISOString(),
    modelsTested: allSummaries.length,
    summaries: allSummaries,
  });

  return [null, report];
}

// ── CLI entry point ──────────────────────────────────────────────────────
const isMain = process.argv[1]?.endsWith('openrouter_benchmark/main.ts') ||
  process.argv[1]?.endsWith('openrouter_benchmark') ||
  import.meta.url?.includes('openrouter_benchmark');

if (isMain) {
  void main().then(([err, report]) => {
    if (err !== null) {
      console.error(`\n❌ FATAL: ${err.message}`);
      process.exit(1);
    }
    if (report !== null) {
      // Print per-model detailed results
      for (const s of report.summaries) {
        console.log(`\n--- ${s.model} ---`);
        for (const r of s.results) {
          console.log(`  [${r.taskId}] correct=${String(r.correct)} latency=${String(r.latencyMs)}ms tokens=${String(r.totalTokens ?? '?')}`);
          if (r.parsed !== null) {
            console.log(`    → intent=${r.parsed.intent} conf=${String(r.parsed.confidence)} human=${String(r.parsed.requires_human)}`);
          }
          if (r.error !== null) {
            console.log(`    → error: ${r.error}`);
          }
        }
      }
    }
    process.exit(0);
  });
}
