// ============================================================================
// LLM CLIENT — OpenAI GPT-4o-mini (primary) + Groq Llama 3.3 (fallback) (v3.2)
// Temperature 0.0, max_tokens 512, timeout 15s, 2 retries, JSON mode
// Pattern: Precision Architecture, No 'any', Errors as Values
// ============================================================================

declare const wmill: { readonly env: Readonly<Record<string, string>> };

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_MODEL = 'gpt-4o-mini';

import { cacheGet, cacheSet } from '../cache';

const MAX_RETRIES = 2;
const BACKOFF_MS = 500;
const TIMEOUT_MS = 15000;

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LLMResponse {
  readonly content: string;
  readonly provider: 'groq' | 'openai';
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

function getGroqKey(): string | null {
  try { if (typeof wmill !== 'undefined' && wmill.env['GROQ_API_KEY'] != null) return wmill.env['GROQ_API_KEY']; } catch { /* wmill not available */ }
  if (typeof process !== 'undefined' && process.env['GROQ_API_KEY'] != null) {
    return process.env['GROQ_API_KEY'] ?? null;
  }
  return null;
}

function getGroqKey2(): string | null {
  try { if (typeof wmill !== 'undefined' && wmill.env['GROQ_API_KEY_2'] != null) return wmill.env['GROQ_API_KEY_2']; } catch { /* wmill not available */ }
  if (typeof process !== 'undefined' && process.env['GROQ_API_KEY_2'] != null) {
    return process.env['GROQ_API_KEY_2'] ?? null;
  }
  return null;
}

function getOpenAIKey(): string | null {
  try { if (typeof wmill !== 'undefined' && wmill.env['OPENAI_API_KEY'] != null) return wmill.env['OPENAI_API_KEY']; } catch { /* wmill not available */ }
  if (typeof process !== 'undefined' && process.env['OPENAI_API_KEY'] != null) {
    return process.env['OPENAI_API_KEY'] ?? null;
  }
  return null;
}

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

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  messages: readonly ChatMessage[],
): Promise<[Error | null, ProviderInternalResult | null]> {
  const [err, response] = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.0,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
  }, TIMEOUT_MS);

  if (err != null || response == null) {
    return [err ?? new Error("Fetch failed without error object"), null];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => 'No error body');
    return [new Error(`LLM API error ${String(response.status)}: ${body}`), null];
  }

  const data = await response.json() as {
    readonly choices: readonly { readonly message: { readonly content: string } }[];
    readonly usage?: { readonly prompt_tokens: number; readonly completion_tokens: number };
  };

  const choice = data.choices[0];
  if (choice == null || choice.message.content === '') {
    return [new Error('LLM API returned empty response'), null];
  }

  return [null, {
    content: choice.message.content,
    tokens_in: data.usage?.prompt_tokens ?? 0,
    tokens_out: data.usage?.completion_tokens ?? 0,
  }];
}

async function callWithRetry(
  url: string,
  apiKey: string,
  model: string,
  messages: readonly ChatMessage[],
  provider: 'groq' | 'openai',
): Promise<[Error | null, LLMResponse | null]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    const [err, result] = await callProvider(url, apiKey, model, messages);
    
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

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<LLMResponse> {
  // Check cache first
  const [cacheErr, cachedEntry] = await cacheGet(userMessage);
  if (cacheErr == null && cachedEntry != null) {
    return {
      content: cachedEntry.response,
      provider: 'groq',
      tokens_in: 0,
      tokens_out: 0,
      latency_ms: 0,
      cached: true,
    };
  }

  const messages: readonly ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // 1. OpenAI GPT-4o-mini (primary — better intent detection, structured JSON)
  const openaiKey = getOpenAIKey();
  if (openaiKey != null) {
    const [err, res] = await callWithRetry(OPENAI_API_URL, openaiKey, OPENAI_MODEL, messages, 'openai');
    if (err == null && res != null) {
      void cacheSet(userMessage, res.content, 'unknown');
      return res;
    }
  }

  // 2. Groq Llama 3.3 70B (fallback — fast, free tier)
  const groqKey = getGroqKey();
  if (groqKey != null) {
    const [err, res] = await callWithRetry(GROQ_API_URL, groqKey, GROQ_MODEL, messages, 'groq');
    if (err == null && res != null) {
      void cacheSet(userMessage, res.content, 'unknown');
      return res;
    }
  }

  // 3. Groq second key (last resort)
  const groqKey2 = getGroqKey2();
  if (groqKey2 != null) {
    const [err, res] = await callWithRetry(GROQ_API_URL, groqKey2, GROQ_MODEL, messages, 'groq');
    if (err == null && res != null) {
      void cacheSet(userMessage, res.content, 'unknown');
      return res;
    }
  }

  throw new Error('No LLM provider configured (set OPENAI_API_KEY or GROQ_API_KEY)');
}
