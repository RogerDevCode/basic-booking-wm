//nobundling
/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Semantic search against knowledge base using pgvector (fallback to keyword)
 * DB Tables Used  : knowledge_base
 * Concurrency Risk: NO — read-only vector similarity query
 * GCal Calls      : NO
 * Idempotency Key : N/A — read-only query
 * RLS Tenant ID   : YES — withTenantContext wraps all DB ops
 * Zod Schemas     : YES — InputSchema validates query text and top_k
 */

import { withTenantContext } from '../internal/tenant-context/index.ts';
import { createDbClient } from '../internal/db/client.ts';
import type { Result } from '../internal/result/index.ts';

import { InputSchema } from './types.ts';
import type { Input, RAGResult } from './types.ts';
import { KBRepository, performKeywordSearch } from './services.ts';

// ============================================================================
// MAIN ENTRY POINT (Windmill Endpoint)
// ============================================================================

export async function main(args: any) : Promise<Result<RAGResult>> {
const rawInput: unknown = args;
  /**
   * REASONING TRACE
   * ### Mission Decomposition
   * - [x] Validate input with Zod (SRP)
   * - [x] Establish RLS context via withTenantContext (Security)
   * - [x] Fetch active knowledge base entries (Repository)
   * - [x] Score entries via keyword matching (Service/KISS)
   * - [x] Return top-K sorted results
   *
   * ### Schema Verification
   * - knowledge_base (kb_id, category, title, content, is_active)
   *
   * ### Failure Mode Analysis
   * - Validation failure -> Return error value
   * - DB/Network failure -> Return error value
   * - No entries found -> Return empty list (Graceful)
   *
   * ### SOLID Compliance Check
   * - SRP: Repository for data, Function for search, Main for orchestration.
   * - DRY: Centralized fetch logic.
   * - KISS: Maintained simple keyword-based ranking.
   * - DIP: TxClient interface used instead of concrete postgres implementation.
   */

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`validation_error: ${parsed.error.message}`), null];
  }

  const input: Input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('configuration_error: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  try {
    const [err, result] = await withTenantContext(sql, input.provider_id, async (tx) => {
      const repo = new KBRepository(tx);
      
      const [fetchErr, rows] = await repo.fetchActiveEntries(input.category);
      
      if (fetchErr !== null) return [fetchErr, null];
      if (rows === null) {
        return [null, { entries: [], count: 0, method: 'keyword' as const }];
      }

      const entries = performKeywordSearch(input.query, rows, input.top_k);
      
      return [null, {
        entries,
        count: entries.length,
        method: 'keyword' // Currently only keyword implemented
      } as const];
    });

    if (err !== null) return [err, null];
    if (result === null) return [new Error('rag_query_failed: empty result'), null];

    return [null, result];

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [new Error(`internal_error: ${msg}`), null];
  } finally {
    await sql.end();
  }
}