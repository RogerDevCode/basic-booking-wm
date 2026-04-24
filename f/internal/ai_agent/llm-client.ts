// ============================================================================
// LLM CLIENT — Configurable Provider Chain (v6.0)
// Temperature 0.0, max_tokens 512, timeout 15s, 2 retries
// Structured Outputs (json_schema strict) for OpenAI, json_object for Groq
// Pattern: Precision Architecture, No 'any', Errors as Values
//
// CONFIGURABLE PROVIDER CHAIN — Set via LLM_PROVIDER_ORDER env var
//   Default: "openai,groq,groq2,openrouter" → gpt-4o-mini → gpt-oss-20b →
//     llama-3.3-70b → openrouter/auto:free (free fallback)
//   Examples:
//     "groq"                    → Only Groq (fastest, cheapest)
//     "groq,openai"             → Groq first, OpenAI fallback
//     "openai,groq"             → OpenAI first, Groq fallback
//     "openai,groq,groq2,openrouter" → Full chain with free fallback (default v6)
// ============================================================================

declare const wmill: { readonly env: Readonly<Record<string, string>> };

// ============================================================================
// CONFIG — Read from env vars (wmill-safe) with sensible defaults
// ============================================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_GROQ_MODEL_2 = 'llama-3.3-70b-versatile';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/auto:free';
const DEFAULT_PROVIDER_ORDER = 'openai,groq,groq2,openrouter';

function getEnv(key: string, fallback: string): string {
  try { if (wmill?.env[key] != null) return wmill.env[key]; } catch { /* wmill not available */ }
  if (typeof process !== 'undefined' && process.env[key] != null) {
    const val = process.env[key];
    if (val != null) return val;
  }
  return fallback;
}

function getEnvOptional(key: string): string | null {
  try { if (wmill?.env[key] != null) return wmill.env[key]; } catch { /* wmill not available */ }
  if (typeof process !== 'undefined' && process.env[key] != null) {
    const val = process.env[key];
    if (val != null && val !== '') return val;
  }
  return null;
}

const CONFIG = {
  groqModel: getEnv('GROQ_MODEL', DEFAULT_GROQ_MODEL),
  groqModel2: getEnv('GROQ_MODEL_2', DEFAULT_GROQ_MODEL_2),
  openaiModel: getEnv('OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
  openrouterModel: getEnv('OPENROUTER_MODEL', DEFAULT_OPENROUTER_MODEL),
  providerOrder: getEnv('LLM_PROVIDER_ORDER', DEFAULT_PROVIDER_ORDER),
  timeoutMs: (() => {
    const envVal = getEnvOptional('GROQ_LLM_TIMEOUT_MS');
    if (envVal != null) { const n = Number(envVal); if (!Number.isNaN(n)) return n; }
    return 15000;
  })(),
} as const;

// ============================================================================
// IMPORTS
// ============================================================================

import { cacheGet, cacheSet } from '../cache/index.ts';
import { INTENT } from './constants.ts';
import { LLMRawAPIResponseSchema } from './types.ts';

const MAX_RETRIES = 2;
const BACKOFF_MS = 500;

// ============================================================================
// OPENAI STRUCTURED OUTPUTS — JSON Schema (strict mode)
// Research: OpenAI docs guarantee 100% schema compliance with CFG engine
// ============================================================================

const INTENT_CLASSIFICATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    intent: {
      type: 'string' as const,
      enum: Object.values(INTENT),
    },
    confidence: {
      type: 'number' as const,
      minimum: 0,
      maximum: 1,
    },
    entities: {
      type: 'object' as const,
      properties: {
        date: { type: ['string', 'null'] as const },
        time: { type: ['string', 'null'] as const },
        booking_id: { type: ['string', 'null'] as const },
        client_name: { type: ['string', 'null'] as const },
        service_type: { type: ['string', 'null'] as const },
      },
      required: ['date', 'time', 'booking_id', 'client_name', 'service_type'],
      additionalProperties: false,
    },
    needs_more: {
      type: 'boolean' as const,
    },
    follow_up: {
      type: ['string', 'null'] as const,
    },
  },
  required: ['intent', 'confidence', 'entities', 'needs_more', 'follow_up'],
  additionalProperties: false,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LLMResponse {
  readonly content: string;
  readonly provider: 'groq' | 'openai' | 'openrouter';
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly latency_ms: number;
  readonly cached?: boolean;
}

interface ProviderInternalResult {
  readonly content: string;
  readonly tokens_in: number;
  readonly tokens_out: number;
}

// ============================================================================
// API KEY RETRIEVAL (wmill-safe)
// ============================================================================

function getGroqKey(): string | null { return getEnvOptional('GROQ_API_KEY'); }
function getGroqKey2(): string | null { return getEnvOptional('GROQ_API_KEY_2'); }
function getOpenAIKey(): string | null { return getEnvOptional('OPENAI_API_KEY'); }
function getOpenRouterKey(): string | null { return getEnvOptional('OPENROUTER_API_KEY'); }

// ============================================================================
// HTTP UTILS
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<[Error | null, Response | null]> {
  const controller = new AbortController();
  const id = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return [null, response];
  } catch (e) {
    return [e instanceof Error ? e : new Error(String(e)), null];
  } finally {
    clearTimeout(id);
  }
}

// ============================================================================
// PROVIDER CALLS
// ============================================================================

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  messages: readonly ChatMessage[],
  useStructuredOutput: boolean,
  providerName: 'groq' | 'openai' | 'openrouter' = 'groq',
): Promise<[Error | null, ProviderInternalResult | null]> {
  const responseFormat = useStructuredOutput
    ? {
        type: 'json_schema' as const,
        json_schema: {
          name: 'intent_classification',
          strict: true,
          schema: INTENT_CLASSIFICATION_SCHEMA,
        },
      }
    : { type: 'json_object' as const };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter requires attribution headers for free tier tracking
  if (providerName === 'openrouter') {
    headers['HTTP-Referer'] = 'https://localhost';
    headers['X-Title'] = 'Windmill Medical Booking System';
  }

  const [err, response] = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.0,
      max_tokens: 512,
      response_format: responseFormat,
    }),
  }, CONFIG.timeoutMs);

  if (err != null || response == null) {
    return [err ?? new Error("Fetch failed without error object"), null];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => 'No error body');
    return [new Error(`LLM API error ${String(response.status)}: ${body}`), null];
  }

  // Zod replaces the banned 'as {choices}' cast — validates the HTTP response
  // structure before accessing any fields. Defense-in-depth: provider bugs
  // (wrong Content-Type, empty choices array) are caught here, not at the
  // callsite. LLMRawAPIResponseSchema is the SSOT in types.ts.
  const rawJson = await response.json();
  const apiParsed = LLMRawAPIResponseSchema.safeParse(rawJson);
  if (!apiParsed.success) {
    return [new Error(`LLM API malformed response: ${apiParsed.error.message}`), null];
  }

  const choice = apiParsed.data.choices[0];
  if (choice == null || choice.message.content === '') {
    return [new Error('LLM API returned empty response'), null];
  }

  return [null, {
    content: choice.message.content,
    tokens_in: apiParsed.data.usage?.prompt_tokens ?? 0,
    tokens_out: apiParsed.data.usage?.completion_tokens ?? 0,
  }];
}

async function callWithRetry(
  url: string,
  apiKey: string,
  model: string,
  messages: readonly ChatMessage[],
  provider: 'groq' | 'openai' | 'openrouter',
  useStructuredOutput: boolean,
): Promise<[Error | null, LLMResponse | null]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    const [err, result] = await callProvider(url, apiKey, model, messages, useStructuredOutput, provider);
    
    if (err == null && result != null) {
      return [null, {
        content: result.content,
        provider,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        latency_ms: Date.now() - start,
      }];
    }
    
    lastError = err;
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, BACKOFF_MS * (attempt + 1)));
    }
  }

  return [new Error(`${provider} failed after ${String(MAX_RETRIES + 1)} attempts: ${lastError?.message ?? 'Unknown'}`), null];
}

// ============================================================================
// SCHEMA VALIDATION (post-parse defense-in-depth)
// ============================================================================

function validateIntentSchema(parsed: Record<string, unknown>): [Error | null, boolean] {
  // Validate intent
  const intent = parsed['intent'];
  if (typeof intent !== 'string') {
    return [new Error('validation_failed: intent must be a string'), false];
  }
  const validIntents = Object.values(INTENT);
  if (!validIntents.includes(intent as typeof INTENT[keyof typeof INTENT])) {
    return [new Error(`validation_failed: invalid intent "${intent}"`), false];
  }

  // Validate confidence
  const confidence = parsed['confidence'];
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return [new Error('validation_failed: confidence must be a number between 0 and 1'), false];
  }

  // Validate entities
  const entities = parsed['entities'];
  if (entities == null || typeof entities !== 'object' || Array.isArray(entities)) {
    return [new Error('validation_failed: entities must be an object'), false];
  }

  return [null, true];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<[Error | null, LLMResponse | null]> {
  // Check cache first
  const [cacheErr, cachedEntry] = await cacheGet(userMessage);
  if (cacheErr == null && cachedEntry != null) {
    return [null, {
      content: cachedEntry.response,
      provider: 'groq',
      tokens_in: 0,
      tokens_out: 0,
      latency_ms: 0,
      cached: true,
    }];
  }

  const messages: readonly ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // ─── Build provider chain from LLM_PROVIDER_ORDER env var ──────────────
  // Supported tokens: groq, groq2, openai, openrouter
  // Example: "openai,groq,groq2,openrouter" → OpenAI → Groq → Groq2 → OpenRouter (free)
  const providerOrder = CONFIG.providerOrder.split(',').map(s => s.trim().toLowerCase());

  const providerMap: Record<string, {
    readonly name: 'openai' | 'groq' | 'openrouter';
    readonly url: string;
    readonly key: string | null;
    readonly model: string;
    readonly structured: boolean;
  }> = {
    groq: {
      name: 'groq' as const,
      url: GROQ_API_URL,
      key: getGroqKey(),
      model: CONFIG.groqModel,
      structured: false,
    },
    groq2: {
      name: 'groq' as const,
      url: GROQ_API_URL,
      key: getGroqKey2(),
      model: CONFIG.groqModel2,
      structured: false,
    },
    openai: {
      name: 'openai' as const,
      url: OPENAI_API_URL,
      key: getOpenAIKey(),
      model: CONFIG.openaiModel,
      structured: true,
    },
    openrouter: {
      name: 'openrouter' as const,
      url: OPENROUTER_API_URL,
      key: getOpenRouterKey(),
      model: CONFIG.openrouterModel,
      structured: false,
    },
  };

  const providers = providerOrder
    .map(token => providerMap[token])
    .filter((p): p is NonNullable<typeof p> => p != null);

  for (const p of providers) {
    if (p.key == null) continue;
    const [err, res] = await callWithRetry(p.url, p.key, p.model, messages, p.name, p.structured);
    if (err == null && res != null) {
      // Validate schema compliance for structured outputs (defense-in-depth)
      if (p.structured) {
        try {
          const cleaned = res.content.replace(/^```json\n?|\n?```$/g, '').trim();
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          const [validationErr] = validateIntentSchema(parsed);
          if (validationErr != null) {
            console.log('[STRUCTURED OUTPUT VALIDATION WARNING]', validationErr.message);
          }
        } catch {
          console.log('[STRUCTURED OUTPUT PARSE WARNING] Response is not valid JSON despite strict mode');
        }
      }
      void cacheSet(userMessage, res.content, INTENT.DESCONOCIDO);
      return [null, res];
    }
  }

  return [new Error('All LLM providers failed (set GROQ_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY)'), null];
}
