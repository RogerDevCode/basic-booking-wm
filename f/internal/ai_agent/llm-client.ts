// ============================================================================
// LLM CLIENT — Groq (primary) + OpenAI (fallback)
// Temperature 0.0, max_tokens 512, timeout 15s, 2 retries
// ============================================================================

declare const wmill: { env: Record<string, string> } | undefined;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_MODEL = 'gpt-4o-mini';

const MAX_RETRIES = 2;
const BACKOFF_MS = 500;
const TIMEOUT_MS = 15000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  provider: 'groq' | 'openai';
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
}

function getGroqKey(): string | null {
  if (typeof wmill !== 'undefined' && wmill?.env?.['GROQ_API_KEY']) {
    return wmill.env['GROQ_API_KEY'];
  }
  if (typeof process !== 'undefined' && process.env?.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }
  return null;
}

function getOpenAIKey(): string | null {
  if (typeof wmill !== 'undefined' && wmill?.env?.['OPENAI_API_KEY']) {
    return wmill.env['OPENAI_API_KEY'];
  }
  if (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  return null;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<{ content: string; tokens_in: number; tokens_out: number }> {
  const response = await fetchWithTimeout(url, {
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

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('LLM API returned empty response');
  }

  return {
    content: choice.message.content,
    tokens_in: data.usage?.prompt_tokens ?? 0,
    tokens_out: data.usage?.completion_tokens ?? 0,
  };
}

async function callWithRetry(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  provider: 'groq' | 'openai',
): Promise<LLMResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const result = await callProvider(url, apiKey, model, messages);
      return {
        content: result.content,
        provider,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        latency_ms: Date.now() - start,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  throw new Error(`${provider} failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<LLMResponse> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // Try Groq first
  const groqKey = getGroqKey();
  if (groqKey) {
    try {
      return await callWithRetry(GROQ_API_URL, groqKey, GROQ_MODEL, messages, 'groq');
    } catch {
      // Fall through to OpenAI
    }
  }

  // Fallback to OpenAI
  const openaiKey = getOpenAIKey();
  if (openaiKey) {
    return await callWithRetry(OPENAI_API_URL, openaiKey, OPENAI_MODEL, messages, 'openai');
  }

  throw new Error('No LLM provider configured (set GROQ_API_KEY or OPENAI_API_KEY)');
}

export type { LLMResponse };
