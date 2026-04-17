/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Refactor tracing.ts applying SOLID and GO-style contracts.
 * DB Tables Used  : None
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO (Uses existing types)
 */

import type { IntentType } from './types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Valid providers for the AI Agent.
 * SRP: Centralizes the union of allowed providers.
 */
export type TraceProvider = "groq" | "openai" | "openrouter" | "fallback" | "fast-path";

/**
 * TraceData interface defining the schema for structured telemetry.
 * KISS: Immutable and focused.
 */
export interface TraceData {
  readonly chat_id: string;
  readonly intent: IntentType;
  readonly confidence: number;
  readonly provider: TraceProvider;
  readonly latency_ms: number;
  readonly tokens_in?: number;
  readonly tokens_out?: number;
  readonly cached?: boolean;
  readonly fallback_used: boolean;
  readonly timestamp: string;
}

/**
 * Interface for trace emission strategy.
 * DIP: Allows injecting different sinks (Console, DB, etc.).
 */
export interface TraceEmitter {
  emit(data: TraceData): void;
}

// ============================================================================
// IMPLEMENTATIONS
// ============================================================================

/**
 * Default implementation using console.log for Windmill telemetry.
 * SRP: Responsibility is ONLY emitting to the console.
 */
export class ConsoleTraceEmitter implements TraceEmitter {
  public emit(data: TraceData): void {
    try {
      const logEntry = JSON.stringify(data);
      console.log(`[AI-TRACE] ${logEntry}`);
    } catch (error: unknown) {
      // Fail loudly in logs but don't crash tracing
      console.error(`[AI-TRACE-ERROR] Failed to serialize trace: ${String(error)}`);
    }
  }
}

/**
 * Registry for the active emitter.
 * OCP: Allows swapping the emitter at runtime if needed.
 */
let activeEmitter: TraceEmitter = new ConsoleTraceEmitter();

/**
 * Allows setting a custom emitter (e.g., for testing or alternate sinks).
 */
export function setTraceEmitter(emitter: TraceEmitter): void {
  activeEmitter = emitter;
}

// ============================================================================
// EXPORTED FUNCTIONS (Stable API)
// ============================================================================

/**
 * Records a trace of the AI Agent execution.
 * Windmill captures console.log as structured telemetry.
 * Signature maintained as per Rule 1.
 */
export function trace(data: TraceData): void {
  activeEmitter.emit(data);
}

/**
 * Factory for creating TraceData objects.
 * SRP: Responsibility is ONLY constructing the object.
 * Signature maintained as per Rule 1.
 */
export function buildTrace(
  chat_id: string,
  intent: IntentType,
  confidence: number,
  provider: TraceData["provider"],
  latency_ms: number,
  fallback_used: boolean
): TraceData {
  return Object.freeze({
    chat_id,
    intent,
    confidence,
    provider,
    latency_ms,
    fallback_used,
    timestamp: new Date().toISOString()
  });
}
