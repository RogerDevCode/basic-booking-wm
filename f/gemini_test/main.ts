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

import type { Result } from '../internal/result';
import { generateReport, getApiKey, printSummary, printTestResult, runTest } from './services';
import type { TestReport, TestResult } from './types';
import { TEST_CASES } from './types';

export async function main(_rawInput: unknown = {}): Promise<Result<TestReport>> {
  const [keyErr, apiKey] = getApiKey();
  if (keyErr || !apiKey) {
    return [new Error(`CONFIG: ${keyErr?.message ?? 'API key missing'}`), null];
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Gemini 2.5 Flash — API Connectivity & Q&A Test`);
  console.log(`  Model: ${TEST_CASES[0]?.name ? 'gemini-2.5-flash' : 'unknown'}`);
  console.log(`  Tests: ${TEST_CASES.length}`);
  console.log(`${'='.repeat(70)}\n`);

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\nRunning: ${testCase.name}`);
    const result = await runTest(apiKey, testCase);
    results.push(result);
    printTestResult(result);
  }

  const report = generateReport(results);
  printSummary(report);

  console.log('Full report preview (first 2):', JSON.stringify(report.results.slice(0, 2), null, 2));

  return [null, report];
}

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