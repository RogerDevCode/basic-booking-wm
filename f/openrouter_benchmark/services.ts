import type {
  Result,
  ModelCandidate,
  OpenRouterResponse,
  TaskPrompt,
  ModelTestResult,
} from './types';
import { OpenRouterResponseSchema, NLUIntentSchema } from './types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getApiKey(): [Error | null, string | null] {
  const key = process.env['OPENROUTER_API_KEY'];
  if (key === undefined || key === '') {
    return [new Error('OPENROUTER_API_KEY is not set'), null];
  }
  return [null, key];
}

export async function callOpenRouter(
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

export function extractJSON(text: string): Record<string, unknown> | null {
  try {
    const obj: unknown = JSON.parse(text);
    if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
  } catch { /* fall through */ }

  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  if (fenceMatch !== null) {
    try {
      const content = fenceMatch[1];
      if (content === undefined) return null;
      const obj: unknown = JSON.parse(content.trim());
      if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (jsonMatch !== null) {
    try {
      const obj: unknown = JSON.parse(jsonMatch[0]);
      if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>;
    } catch { /* fall through */ }
  }

  return null;
}

export async function runTaskForModel(
  apiKey: string,
  model: ModelCandidate,
  task: TaskPrompt,
  systemPrompt: string,
): Promise<Result<ModelTestResult>> {
  const start = Date.now();

  const [err, response] = await callOpenRouter(
    apiKey,
    model.id,
    systemPrompt,
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