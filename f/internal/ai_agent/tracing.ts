// ============================================================================
// TRACING — Structured request logging for observability
// ============================================================================

declare const wmill: { log: (msg: string, level?: string) => void } | undefined;

interface TraceEntry {
  chat_id: string;
  intent: string;
  confidence: number;
  provider: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cached: boolean;
  fallback_used: boolean;
  timestamp: string;
}

export function trace(entry: TraceEntry): void {
  const msg = JSON.stringify(entry);
  if (typeof wmill !== 'undefined' && wmill?.log) {
    wmill.log(msg, 'info');
  } else {
    console.log(`[AI-TRACE] ${msg}`);
  }
}

export function buildTrace(
  chatId: string,
  intent: string,
  confidence: number,
  provider: string,
  latencyMs: number,
  tokensIn: number,
  tokensOut: number,
  cached: boolean,
  fallbackUsed: boolean,
): TraceEntry {
  return {
    chat_id: chatId,
    intent,
    confidence,
    provider,
    latency_ms: latencyMs,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cached,
    fallback_used: fallbackUsed,
    timestamp: new Date().toISOString(),
  };
}
