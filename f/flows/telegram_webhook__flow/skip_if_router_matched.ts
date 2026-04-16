/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Gate to skip AI Agent if router handled the message deterministically
 * DB Tables Used  : None
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO — no inputs in current signature
 */

import type { Result } from "../../internal/result";

/**
 * REASONING TRACE
 *
 * 1. Mission Decomposition:
 *    - Act as a flow gate to prevent AI Agent execution when a deterministic route matches.
 *    - Return a Result tuple conforming to AGENTS.md §4 and §12.
 *
 * 2. SOLID compliance:
 *    - SRP: Single purpose of acting as a flow control point.
 *    - DRY: Uses centralized Result type.
 *    - KISS: Minimal implementation for maximum reliability.
 *
 * 3. Architecture:
 *    - The logic for skipping is primarily handled by Windmill's skip_if at the flow level.
 *    - This script serves as the target for that skip_if evaluation, preventing unnecessary LLM calls.
 */

// ============================================================================
// Types
// ============================================================================

interface GateResult {
  readonly skip: boolean;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Gate: skip AI Agent if router already matched a deterministic route.
 * Returns success = false (skip: false) when the step is executed,
 * meaning the flow should proceed (or was not skipped by the engine).
 *
 * @returns A Result tuple with the skip status.
 */
export async function main(): Promise<Result<GateResult>> {
  // In Windmill, this module is skipped via YAML 'skip_if' if the router handled the message.
  // If we reach this code, it means we are NOT skipping the subsequent AI Agent.
  const result: GateResult = Object.freeze({
    skip: false,
  });

  return [null, result];
}
