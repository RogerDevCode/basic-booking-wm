// ============================================================================
// RAG CONTEXT BUILDER — Multi-Provider Knowledge Base Integration
// Queries knowledge_base with provider isolation.
// If tx is not provided, creates its own connection (safe for read-only FAQs).
// ============================================================================

import postgres from 'postgres';
import { createDbClient } from '../db/client.ts';

export interface FAQEntry {
  readonly kb_id: string;
  readonly provider_id: string | null;
  readonly category: string;
  readonly title: string;
  readonly content: string;
  readonly relevance: number;
}

interface ScoredEntry {
  readonly entry: FAQEntry;
  readonly score: number;
}

function normalizeQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(function(t: string): boolean { return t.length > 2; });
}

function scoreFAQ(entry: { title: string; content: string; category: string }, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    if (entry.title.includes(term)) score += 10;
    if (entry.content.includes(term)) score += 1;
    if (entry.category.includes(term)) score += 5;
  }
  return score;
}

export interface RAGContextResult {
  readonly context: string;
  readonly count: number;
  readonly hasProviderSpecific: boolean;
}

/**
 * buildRAGQuery — Rewrites raw user text into a normalized, intent-specific RAG query.
 *
 * Problem solved: raw user text often contains Chilean slang, typos, and filler
 * words (e.g. "ola doctor tiene hora pal biernes") that produce zero TF-IDF matches
 * against FAQ entries about "disponibilidad" or "horarios".
 *
 * Strategy (KISS §2.2):
 *  - Map detected intent to a set of canonical domain keywords.
 *  - Append service_type entity if present (provides topical context).
 *  - For GENERAL_QUESTION: pass the raw text through (already domain-relevant).
 *
 * No LLM call — pure deterministic rewriting. Zero latency overhead.
 * Called by main.ts BEFORE invoking buildRAGContext.
 */
export function buildRAGQuery(
  rawText: string,
  intent: string,
  entities: Readonly<{ date?: string | null; service_type?: string | null }>,
): string {
  const intentKeywords: Readonly<Record<string, string>> = {
    consultar_disponibilidad:   'disponibilidad horarios turnos libres citas disponibles',
    crear_cita:   'agendar reservar cita nueva turno hora disponible',
    cancelar_cita:   'cancelar anular eliminar borrar cita turno',
    reagendar:           'cambiar reprogramar reagendar mover cita turno',
    ver_mis_citas:      'mis citas reservas confirmadas agenda',
    urgencia:          'urgencia emergencia atencion inmediata dolor',
    activar_recordatorios:   'recordatorios notificaciones avisos activar',
    deactivar_recordatorios: 'recordatorios notificaciones avisos desactivar',
    preferencias_recordatorio: 'preferencias recordatorios canales configuracion',
    general_question:     rawText, // pass-through — already domain-relevant phrasing
  };

  const baseQuery = intentKeywords[intent] ?? rawText;
  const serviceContext = entities.service_type != null && entities.service_type !== ''
    ? ` ${entities.service_type}`
    : '';

  return `${baseQuery}${serviceContext}`.trim();
}

/**
 * Builds RAG context from knowledge_base entries.
 * Caller MUST ensure the tx is within withTenantContext for RLS enforcement.
 * No direct DB connection is created here — the caller provides the connection.
 *
 * TIP: Call buildRAGQuery() to normalize the query before passing it here.
 * If tx is not provided, creates its own connection (read-only, safe for FAQs).
 */
export async function buildRAGContext(
  txOrProviderId: postgres.Sql | string | null,
  query: string,
  topK = 3,
): Promise<RAGContextResult> {
  const terms = normalizeQuery(query);
  if (terms.length === 0) {
    return { context: '', count: 0, hasProviderSpecific: false };
  }

  const dbUrl = process.env['DATABASE_URL'];
  let ownConnection = false;
  const tx = txOrProviderId && typeof txOrProviderId !== 'string'
    ? txOrProviderId
    : (dbUrl ? (() => { ownConnection = true; return createDbClient({ url: dbUrl, ssl: false }); })() : null);

  if (tx == null) {
    return { context: '', count: 0, hasProviderSpecific: false };
  }

  try {
    // Fetch FAQs — knowledge_base contains public + provider-specific FAQs
    const rows = await tx.values<[string, string | null, string, string, string][]>`
      SELECT kb_id, provider_id, category, title, content
      FROM knowledge_base
      WHERE is_active = true
      ORDER BY category, title
    `;

    if (rows.length === 0) {
      return { context: '', count: 0, hasProviderSpecific: false };
    }

    // Score each FAQ entry
    const scored: ScoredEntry[] = [];
    let hasProviderSpecific = false;

  for (const row of rows) {
    const title = typeof row[2] === 'string' ? row[2] : '';
    const content = typeof row[3] === 'string' ? row[3] : '';
    const category = typeof row[4] === 'string' ? row[4] : '';
    const rowProviderId = row[1] ?? null;

    const s = scoreFAQ({ title, content, category }, terms);
    if (s > 0) {
      if (rowProviderId != null) hasProviderSpecific = true;
      scored.push({
        entry: {
          kb_id: row[0],
          provider_id: rowProviderId,
          category,
          title,
          content,
          relevance: Math.min(s / 100, 1.0),
        },
        score: s,
      });
    }
  }

  // Sort by score, take top K
  scored.sort(function(a, b): number { return b.score - a.score; });
  const topEntries = scored.slice(0, topK);

  if (topEntries.length === 0) {
    return { context: '', count: 0, hasProviderSpecific: false };
  }

  // Format as RAG context for LLM
  const contextParts: string[] = [
    '\n=== CONOCIMIENTO DEL CONSULTORIO (RAG) ===',
    'La siguiente información proviene de la base de conocimiento:',
    '',
  ];

  for (let i = 0; i < topEntries.length; i++) {
    const e = topEntries[i]?.entry;
    if (e == null) continue;
    const scope = e.provider_id != null ? '[Proveedor específico]' : '[Información general]';
    contextParts.push(scope + ' [' + String(i + 1) + '] ' + e.title);
    contextParts.push('Categoría: ' + e.category);
    contextParts.push('Respuesta: ' + e.content);
    contextParts.push('');
  }

  contextParts.push('Usa esta información para responder la pregunta del usuario de manera precisa y basada en los datos reales del consultorio.');
  contextParts.push('===================================');

  return {
    context: contextParts.join('\n'),
    count: topEntries.length,
    hasProviderSpecific,
  };
  } finally {
    if (ownConnection) {
      await (tx).end();
    }
  }
}
