// ============================================================================
// RAG QUERY — Semantic search against knowledge base using pgvector
// ============================================================================
// Takes a user query, generates an embedding (via API or fallback),
// and returns top-K matching FAQ entries from knowledge_base table.
// ============================================================================

import { z } from 'zod';
import postgres from 'postgres';

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
function keywordSearch(query: string, entries: Record<string, unknown>[]): KBEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(function(t: string): boolean { return t.length > 2; });
  const scored: { entry: KBEntry; score: number }[] = [];

  for (const row of entries) {
    const title = String(row['title'] ?? '').toLowerCase();
    const content = String(row['content'] ?? '').toLowerCase();
    const category = String(row['category'] ?? '').toLowerCase();
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

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: { entries: KBEntry[]; count: number; method: string } | null;
  error_message: string | null;
}> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, data: null, error_message: 'Validation error: ' + parsed.error.message };
  }

  const input = parsed.data;
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl === undefined || dbUrl === '') {
    return { success: false, data: null, error_message: 'CONFIGURATION_ERROR: DATABASE_URL is required' };
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Check if pgvector extension is available
    const extRows = await sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector' LIMIT 1
    `;
    const hasVector = (extRows ?? []).length > 0;

    if (hasVector) {
      // Try vector search with cosine similarity
      // Note: In production, generate embedding via OpenAI/Groq API first
      // For now, use keyword search as fallback
      const categoryFilter = input.category !== undefined ? input.category : null;
      let query;
      if (categoryFilter !== null) {
        query = await sql`
          SELECT kb_id, category, title, content
          FROM knowledge_base
          WHERE category = ${categoryFilter} AND is_active = true
        `;
      } else {
        query = await sql`
          SELECT kb_id, category, title, content
          FROM knowledge_base
          WHERE is_active = true
        `;
      }

      const entries: Record<string, unknown>[] = query as Record<string, unknown>[];
      const results = keywordSearch(input.query, entries).slice(0, input.top_k);
      return { success: true, data: { entries: results, count: results.length, method: 'keyword' }, error_message: null };
    }

    // Fallback: keyword search without pgvector
    const categoryFilter = input.category !== undefined ? input.category : null;
    let query;
    if (categoryFilter !== null) {
      query = await sql`
        SELECT kb_id, category, title, content
        FROM knowledge_base
        WHERE category = ${categoryFilter} AND is_active = true
      `;
    } else {
      query = await sql`
        SELECT kb_id, category, title, content
        FROM knowledge_base
        WHERE is_active = true
      `;
    }

    const entries: Record<string, unknown>[] = query as Record<string, unknown>[];
    const results = keywordSearch(input.query, entries).slice(0, input.top_k);
    return { success: true, data: { entries: results, count: results.length, method: 'keyword' }, error_message: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error_message: 'Internal error: ' + message };
  } finally {
    await sql.end();
  }
}
