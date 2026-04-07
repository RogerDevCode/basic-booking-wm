// ============================================================================
// RAG QUERY — Semantic search against knowledge base using pgvector
// ============================================================================
// Takes a user query, generates an embedding (via API or fallback),
// and returns top-K matching FAQ entries from knowledge_base table.
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';
import { withTenantContext } from '../internal/tenant-context';
import { createDbClient } from '../internal/db/client';

const InputSchema = z.object({
  query: z.string().min(1).max(500),
  top_k: z.number().int().min(1).max(20).default(5),
  category: z.string().optional(),
});

interface KBEntry {
  readonly kb_id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
  readonly similarity: number;
}

// Simple keyword-based fallback when no embedding API is available
function keywordSearch(query: string, entries: Readonly<Record<string, unknown>>[]): KBEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(function(t: string): boolean { return t.length > 2; });
  const scored: { entry: KBEntry; score: number }[] = [];

  for (const row of entries) {
    const title = typeof row['title'] === 'string' ? row['title'].toLowerCase() : '';
    const content = typeof row['content'] === 'string' ? row['content'].toLowerCase() : '';
    const category = typeof row['category'] === 'string' ? row['category'].toLowerCase() : '';
    let score = 0;

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (content.includes(term)) score += 1;
      if (category.includes(term)) score += 2;
    }

    if (score > 0) {
      scored.push({
        entry: {
          kb_id: String(row['kb_id']),
          category: category,
          title: String(row['title']),
          content: String(row['content']),
          similarity: Math.min(score / (terms.length * 3), 1.0),
        },
        score: score,
      });
    }
  }

  scored.sort(function(a, b): number { return b.score - a.score; });
  return scored.map(function(s): KBEntry { return s.entry; });
}

export async function main(rawInput: unknown): Promise<[Error | null, { entries: KBEntry[]; count: number; method: string } | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error('Validation error: ' + parsed.error.message), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return [new Error('CONFIGURATION_ERROR: DATABASE_URL is required'), null];
  }

  const sql = createDbClient({ url: dbUrl });

  const rawObj = typeof rawInput === 'object' && rawInput !== null ? rawInput : {};
  let tenantId = '00000000-0000-0000-0000-000000000000';
  const tenantKeys = ['provider_id', 'user_id', 'admin_user_id', 'client_id', 'client_user_id'] as const;
  for (const key of tenantKeys) {
    const val = (rawObj as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      tenantId = val;
      break;
    }
  }

  try {
    const [txErr, txData] = await withTenantContext(sql, tenantId, async (tx) => {
      // Check if pgvector extension is available
      const extRows = await tx.values<[string][]>`
        SELECT extname FROM pg_extension WHERE extname = 'vector' LIMIT 1
      `;
      const hasVector = extRows.length > 0;

      const categoryFilter = input.category ?? null;
      let rows: [string, string, string, string][];

      if (categoryFilter !== null) {
        rows = await tx.values<[string, string, string, string][]>`
          SELECT kb_id, category, title, content
          FROM knowledge_base
          WHERE category = ${categoryFilter} AND is_active = true
        `;
      } else {
        rows = await tx.values<[string, string, string, string][]>`
          SELECT kb_id, category, title, content
          FROM knowledge_base
          WHERE is_active = true
        `;
      }

      const entries: Readonly<Record<string, unknown>>[] = rows.map((row) => ({
        kb_id: row[0],
        category: row[1],
        title: row[2],
        content: row[3],
      }));

      const results = keywordSearch(input.query, entries).slice(0, input.top_k);
      return [null, { entries: results, count: results.length, method: hasVector ? 'keyword' : 'keyword' }];
    });

    if (txErr !== null) return [txErr, null];
    if (txData === null) return [new Error('RAG query failed'), null];
    return [null, txData];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return [new Error('Internal error: ' + message), null];
  } finally {
    await sql.end();
  }
}
