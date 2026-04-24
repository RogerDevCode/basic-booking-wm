import type { Result } from '../internal/result/index.ts';
import type { TxClient } from '../internal/tenant-context/index.ts';
import type { KBRow, KBEntry } from './types.ts';

// ============================================================================
// REPOSITORY LAYER (SRP: Data Access)
// ============================================================================

export class KBRepository {
  constructor(private readonly tx: TxClient) {}

  /**
   * Fetches active knowledge base entries, optionally filtered by category.
   * Assumes schema: knowledge_base (kb_id, category, title, content, is_active)
   */
  async fetchActiveEntries(category?: string): Promise<Result<readonly KBRow[]>> {
    try {
      const rows = category
        ? await this.tx<KBRow[]>`
            SELECT kb_id, category, title, content
            FROM knowledge_base
            WHERE category = ${category} AND is_active = true
          `
        : await this.tx<KBRow[]>`
            SELECT kb_id, category, title, content
            FROM knowledge_base
            WHERE is_active = true
          `;
      
      return [null, rows];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return [new Error(`kb_fetch_failed: ${msg}`), null];
    }
  }
}

// ============================================================================
// SERVICE LAYER (SRP: Business Logic)
// ============================================================================

/**
 * Keyword-based search implementation.
 * KISS: Simple scoring without external dependencies or complex embeddings.
 */
export function performKeywordSearch(
  query: string, 
  entries: readonly KBRow[],
  topK: number
): KBEntry[] {
  const terms = query.toLowerCase()
    .split(/\s+/)
    .filter((t): boolean => t.length > 2);

  if (terms.length === 0) return [];

  const scored = entries.map((row) => {
    const title = row.title.toLowerCase();
    const content = row.content.toLowerCase();
    const category = row.category.toLowerCase();
    
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (content.includes(term)) score += 1;
      if (category.includes(term)) score += 2;
    }

    return {
      entry: {
        kb_id: row.kb_id,
        category: row.category,
        title: row.title,
        content: row.content,
        similarity: Math.min(score / (terms.length * 3), 1.0),
      },
      score
    };
  })
  .filter((s): boolean => s.score > 0)
  .sort((a, b): number => b.score - a.score)
  .slice(0, topK);

  return scored.map((s): KBEntry => s.entry);
}
