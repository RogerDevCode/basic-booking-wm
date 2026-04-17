import type { Result } from '../internal/result';
import type { GeminiResponse, TestCase, TestReport, TestResult } from './types';
import { GEMINI_MODEL, GEMINI_API_BASE_URL, TEST_CASES } from './types';

const MODULE = 'gemini_test:services';

export function getApiKey(): Result<string> {
  const key = process.env['GOOGLE_API_KEY'];
  if (!key) {
    return [new Error('GOOGLE_API_KEY is not set in environment'), null];
  }
  return [null, key];
}

export async function callGemini(
  apiKey: string,
  params: {
    systemPrompt: string;
    userMessage: string;
    temperature?: number;
    jsonMode?: boolean;
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
        new Error(`HTTP ${response.status}: ${errorBody.slice(0, 500)}`),
        null,
      ];
    }

    const { GeminiResponseSchema } = await import('./types');
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

export async function runTest(
  apiKey: string,
  testCase: TestCase
): Promise<TestResult> {
  const start = Date.now();

  const [err, response] = await callGemini(apiKey, {
    systemPrompt: testCase.systemPrompt,
    userMessage: testCase.userMessage,
    temperature: testCase.temperature,
    jsonMode: testCase.jsonMode,
  });

  const latencyMs = Date.now() - start;

  if (err || !response) {
    return {
      name: testCase.name,
      success: false,
      response: null,
      error: err?.message ?? 'Unknown error',
      tokenUsage: null,
      latencyMs,
      modelVersion: null,
    };
  }

  const content = response.candidates[0]?.content?.parts?.[0]?.text ?? '';
  const usage = response.usageMetadata;

  return {
    name: testCase.name,
    success: true,
    response: content,
    error: null,
    tokenUsage: {
      prompt: usage?.promptTokenCount ?? null,
      candidates: usage?.candidatesTokenCount ?? null,
      total: usage?.totalTokenCount ?? null,
    },
    latencyMs,
    modelVersion: response.modelVersion ?? null,
  };
}

export function generateReport(results: readonly TestResult[]): TestReport {
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

export function printTestResult(result: TestResult): void {
  if (result.success) {
    const preview = result.response && result.response.length > 120
      ? result.response.slice(0, 120).replace(/\n/g, ' ') + '...'
      : result.response.replace(/\n/g, ' ');
    console.log(`  ✓ ${result.name} (${result.latencyMs}ms, ${result.tokenUsage?.total ?? '?'} tokens)`);
    console.log(`    → ${preview}`);
  } else {
    console.log(`  ✗ ${result.name}: ${result.error}`);
  }
}

export function printSummary(report: TestReport): void {
  const avgLatency = report.results.length > 0
    ? Math.round(report.results.reduce((sum, r) => sum + r.latencyMs, 0) / report.results.length)
    : 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log('='.repeat(70));
  console.log(`  Model        : ${report.model}`);
  console.log(`  Total tests  : ${report.totalTests}`);
  console.log(`  Passed       : ${report.passed}`);
  console.log(`  Failed       : ${report.failed}`);
  console.log(`  Avg latency  : ${avgLatency}ms`);
  console.log(`${'='.repeat(70)}\n`);
}