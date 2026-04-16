/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Gate to skip subsequent steps if the update is a callback query
 * DB Tables Used  : NONE
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO
 */

import type { Result } from "../../internal/result";

/**
 * REASONING TRACE
 *
 * 1. Mission Decomposition:
 *    - Act as a marker in the Telegram webhook flow to identify non-callback updates.
 *    - Follow Go-style Result pattern per AGENTS.md §1 and §12.
 *    - Maintain the existing exported signature while improving internal structure.
 *
 * 2. SOLID compliance:
 *    - SRP: Dedicated gate for callback query flow branching.
 *    - DRY: Uses centralized Result type.
 *    - KISS: Minimal implementation, as the branching logic resides in Windmill's skip_if.
 *
 * 3. Architecture:
 *    - The gate is skipped by Windmill if callback_data is present.
 *    - If executed, it confirms that no callback was detected in this flow branch.
 */

// ============================================================================
// Types
// ============================================================================

interface GateOutput {
  readonly has_callback: boolean;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Gate: if callback_data exists, skip parser (router will handle it directly).
 * Windmill evaluates skip_if expr; if true, this module and all downstream
 * modules that depend on its output are skipped.
 * 
 * @returns A Result tuple indicating no callback was detected in this branch.
 */
export async function main(): Promise<Result<GateOutput>> {
  // If this code is reached, the update is NOT a callback query 
  // (otherwise the skip_if logic in Windmill would have bypassed this step).
  const result: GateOutput = Object.freeze({
    has_callback: false,
  });

  return [null, result];
}
