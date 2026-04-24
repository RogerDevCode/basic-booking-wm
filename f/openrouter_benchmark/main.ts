//nobundling
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

import { getApiKey, runTaskForModel } from './services.ts';
import type { BenchmarkReport, ModelSummary, ModelTestResult } from './types.ts';
import { MODELS, SYSTEM_PROMPT, TASKS } from './types.ts';

export async function main(_args: any = {}): Promise<[Error | null, BenchmarkReport | null]> {
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
      const [err, result] = await runTaskForModel(apiKey, model, task, SYSTEM_PROMPT);
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