/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Gate to skip booking orchestrator if router handled the message deterministically
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
 *    - Act as a flow control gate for the booking orchestrator.
 *    - Ensure the orchestrator is only executed when the AI Agent has extracted a booking intent.
 *    - Adhere to AGENTS.md §4 and §12 standards for Result tuples and error handling.
 *
 * 2. SOLID compliance:
 *    - SRP: Single responsibility of providing a flow control signal.
 *    - DRY: Utilizes centralized Result type from internal/result.
 *    - KISS: Minimal and deterministic implementation.
 *
 * 3. Architecture:
 *    - The logic for conditional execution is primarily managed by Windmill's YAML 'skip_if' layer.
 *    - This script provides a consistent return value when the step is reached in the flow.
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
 * Gate: skip booking orchestrator if router handled the message deterministically.
 * The orchestrator is only needed when the AI Agent extracted a booking intent.
 *
 * @returns A Result tuple with the skip status.
 */
export async function main(): Promise<Result<GateResult>> {
  // If this script is executed (i.e., not skipped by the flow engine's YAML expr),
  // it means we intend to proceed with the next step in this branch.
  const result: GateResult = Object.freeze({
    skip: false,
  });

  return [null, result];
}
