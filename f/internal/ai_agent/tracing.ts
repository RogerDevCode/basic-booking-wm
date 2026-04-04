// ============================================================================
// TRACING — Request tracing and observability (v3.1)
// Pattern: Precision Architecture, No 'any', Immutability
// ============================================================================

import type { IntentType } from './types';

export interface TraceData {
  readonly chat_id: string;
  readonly intent: IntentType;
  readonly confidence: number;
  readonly provider: "groq" | "openai" | "fallback" | "fast-path";
  readonly latency_ms: number;
  readonly tokens_in?: number;
  readonly tokens_out?: number;
  readonly cached?: boolean;
  readonly fallback_used: boolean;
  readonly timestamp: string;
}

/**
 * Records a trace of the AI Agent execution.
 * Windmill captures console.log as structured telemetry.
 */
export function trace(data: TraceData): void {
  const logEntry = JSON.stringify(data);
  console.log(`[AI-TRACE] ${logEntry}`);
}

export function buildTrace(
  chat_id: string,
  intent: IntentType,
  confidence: number,
  provider: TraceData["provider"],
  latency_ms: number,
  fallback_used: boolean
): TraceData {
  return {
    chat_id,
    intent,
    confidence,
    provider,
    latency_ms,
    fallback_used,
    timestamp: new Date().toISOString()
  };
}
