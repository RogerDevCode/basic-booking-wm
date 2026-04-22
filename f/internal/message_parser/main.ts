/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Telegram webhook message normalization
 * DB Tables Used  : NONE — pure message parsing utility
 * Concurrency Risk: NO — stateless message processing
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only message parsing
 * RLS Tenant ID   : NO — stateless utility, no tenant context needed
 * Zod Schemas     : YES — MessageParserInputSchema validates chat_id, text
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate incoming webhook payload (chat_id, text, optional user_metadata) via Zod schema
 * - Construct username from metadata (first_name + last_name, or username fallback)
 * - Sanitize text for downstream SQL (escape backslashes and quotes, enforce 500-char limit)
 * - Return normalized MessageParserData with metadata envelope
 *
 * ### Schema Verification
 * - Tables: NONE — pure message parsing utility, no DB queries
 * - Columns: N/A
 *
 * ### Failure Mode Analysis
 * - Scenario 1: Invalid chat_id format (non-numeric) → Zod validation rejects, returns error response with error_code
 * - Scenario 2: Text exceeds 500 chars → trimmed to limit; prevents downstream payload overflow
 *
 * ### Concurrency Analysis
 * - Risk: NO — stateless message processing; no shared state or locks
 *
 * ### SOLID Compliance Check
 * - SRP: YES — only normalizes Telegram webhook payloads; single responsibility
 * - DRY: YES — single schema validation; no duplicated parsing logic
 * - KISS: YES — minimal transformation pipeline; no over-engineered parsing
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// MESSAGE PARSER — Telegram Webhook Normalization (v3.1)
// ============================================================================

import { 
  validateInput, 
  constructUsername, 
  sanitizeText, 
  createErrorResponse, 
  createSuccessResponse 
} from './services';
import type { MessageParserResponse } from './types';

/**
 * Normalizes incoming Telegram messages for the booking system pipeline.
 */
export async function main(chat_id: string, text: string, user_metadata?: unknown): Promise<MessageParserResponse> {
  const [valErr, data] = validateInput({ chat_id, text, user_metadata });
  if (valErr !== null || data === null) {
    return createErrorResponse(valErr?.message ?? 'invalid_input');
  }

  const chatIdNum = Number(data.chat_id);

  const constructedName = constructUsername(data.user_metadata);
  const safeText = sanitizeText(data.text);

  return createSuccessResponse(chatIdNum, safeText, constructedName);
}
