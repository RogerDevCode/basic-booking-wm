/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Validate parser result and provide flow control signal
 * DB Tables Used  : NONE
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO — stateless flow control
 */

import type { Result } from "../../internal/result.ts";

/**
 * REASONING TRACE
 *
 * 1. Mission Decomposition:
 *    - Serve as a checkpoint for message parsing results in the Telegram flow.
 *    - Return a Result tuple conforming to AGENTS.md §4 and §12.
 *
 * 2. SOLID compliance:
 *    - SRP: Single purpose of acting as a flow control point for parser state.
 *    - DRY: Uses centralized Result type for consistent error handling.
 *    - KISS: Minimal implementation that fulfills the flow's architectural requirement.
 *
 * 3. Architecture:
 *    - In the Windmill flow, this node runs only if the parser succeeded (via skip_if).
 *    - Returning { skip: true } maintains compatibility with the existing flow logic.
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
 * Gate: confirms parser success and signals flow continuation status.
 * 
 * @returns A Result tuple with the skip status.
 */
export async function main(): Promise<Result<GateResult>> {
  // If this node is executed, it means results.parse_message.success was true
  // according to the flow's skip_if logic.
  const result: GateResult = Object.freeze({
    skip: true,
  });

  return [null, result];
}
