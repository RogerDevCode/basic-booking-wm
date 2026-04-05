// ============================================================================
// RAG CONTEXT BUILDER — Knowledge Base Integration for AI Agent
// Queries knowledge_base table and formats relevant FAQs for LLM context injection
// ============================================================================

import postgres from 'postgres';

export interface FAQEntry {
  readonly kb_id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
  readonly relevance: number;
}

// Stop words for Spanish — remove noise from queries
const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'para', 'por', 'con', 'sin', 'sobre',
  'es', 'son', 'esta', 'estan', 'fue', 'ser', 'hay', 'tiene',
  'que', 'se', 'no', 'me', 'te', 'le', 'les', 'lo', 'la',
  'mi', 'tu', 'su', 'nuestro', 'sus',
  'y', 'o', 'pero', 'si', 'como', 'donde', 'cuando', 'cual',
  'muy', 'mas', 'menos', 'bien', 'asi',
  'puedo', 'pueden', 'aceptan', 'realizan', 'hacen', 'ofrecen',
  'necesito', 'quiero', 'debo', 'deben',
  ' alguna', 'algun', 'ningun', 'ninguna',
]);

// Spanish typo/variant normalization
const NORMALIZATION: Record<string, string> = {
  'seguro': 'seguro medico',
  'isapre': 'seguro medico isapre',
  'fonasa': 'seguro medico fonasa',
  'convenio': 'convenio medico',
  'hora': 'cita hora turno',
  'cita': 'cita hora turno',
  'turno': 'cita hora turno',
  'agendar': 'agendar reservar pedir hora',
  'cancelar': 'cancelar anular eliminar',
  'reagendar': 'reagendar reprogramar cambiar',
  'precio': 'precio costo valor consulta',
  'costo': 'precio costo valor consulta',
  'valor': 'precio costo valor consulta',
  'horario': 'horario horario atencion hora',
  'abierto': 'abierto cerrado horario atencion',
  'cerrado': 'abierto cerrado horario atencion',
  'documento': 'documento requisitos papeles',
  'requisito': 'documento requisitos papeles',
  'examen': 'examen laboratorio analisis',
  'resultado': 'resultado examen laboratorio',
  'receta': 'receta medicamento prescripcion',
  'medicamento': 'receta medicamento farmacia',
  'urgencia': 'urgencia emergencia hospital',
  'emergencia': 'urgencia emergencia hospital',
  'especialista': 'especialista doctor medico',
  'doctor': 'especialista doctor medico',
  'medico': 'especialista doctor medico',
};

function normalizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?¿!¡.,;:()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .flatMap(w => {
      const expanded = NORMALIZATION[w];
      return expanded != null ? expanded.split(' ') : [w];
    });
}

interface ScoredEntry {
  entry: FAQEntry;
  score: number;
}

function scoreFAQ(entry: { title: string; content: string; category: string }, terms: string[]): number {
  const title = entry.title.toLowerCase();
  const content = entry.content.toLowerCase();
  const category = entry.category.toLowerCase();
  let score = 0;

  for (const term of terms) {
    // Exact match in title = highest priority
    if (title === term) { score += 20; continue; }
    // Term appears in title
    if (title.includes(term)) { score += 10; }
    // Term appears in category
    if (category.includes(term)) { score += 5; }
    // Term appears in content
    if (content.includes(term)) { score += 2; }
    // Word boundary match in content (more precise)
    const boundaryRe = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (boundaryRe.test(content)) { score += 3; }
  }

  // Bonus: shorter queries with high match ratio
  if (terms.length > 0) {
    const matchRatio = score / (terms.length * 20);
    score *= Math.min(1 + matchRatio, 2);
  }

  return score;
}

export async function buildRAGContext(
  query: string,
  topK: number = 3
): Promise<string> {
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    return '';
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Fetch all active FAQs
    const rows = await sql`
      SELECT kb_id, category, title, content
      FROM knowledge_base
      WHERE is_active = true
      ORDER BY category, title
    `;

    if (rows.length === 0) {
      return '';
    }

    const terms = normalizeQuery(query);
    if (terms.length === 0) {
      return '';
    }

    // Score each FAQ entry
    const scored: ScoredEntry[] = [];
    for (const row of rows) {
      const title = typeof row['title'] === 'string' ? row['title'] : '';
      const content = typeof row['content'] === 'string' ? row['content'] : '';
      const category = typeof row['category'] === 'string' ? row['category'] : '';

      const s = scoreFAQ({ title, content, category }, terms);
      if (s > 0) {
        scored.push({
          entry: {
            kb_id: String(row['kb_id']),
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
    scored.sort((a, b) => b.score - a.score);
    const topEntries = scored.slice(0, topK);

    if (topEntries.length === 0) {
      return '';
    }

    // Format as RAG context for LLM
    const contextParts: string[] = [
      '\n=== CONOCIMIENTO DE LA BASE DE DATOS (RAG) ===',
      'La siguiente información proviene de la base de conocimiento del consultorio:',
      '',
    ];

    for (let i = 0; i < topEntries.length; i++) {
      const e = topEntries[i]?.entry;
      if (e == null) continue;
      contextParts.push(`[${String(i + 1)}] ${e.title}`);
      contextParts.push(`Categoría: ${e.category}`);
      contextParts.push(`Respuesta: ${e.content}`);
      contextParts.push('');
    }

    contextParts.push('Usa esta información para responder la pregunta del usuario de manera precisa y basada en los datos reales del consultorio.');
    contextParts.push('===================================');

    return contextParts.join('\n');
  } catch {
    // If RAG fails, return empty string — LLM will use general knowledge
    return '';
  } finally {
    await sql.end();
  }
}
