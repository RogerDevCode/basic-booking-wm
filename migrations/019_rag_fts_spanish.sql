-- ============================================================================
-- Migration 019 — RAG Full-Text Search en español (reemplaza substring scoring)
-- Fecha: 2026-05-17
--
-- Reemplaza la búsqueda léxica por substring (Python, in-memory) por FTS nativo
-- de Postgres con:
--   - config 'spanish'  → stemming + stopwords español
--   - unaccent           → "atención" ≡ "atencion" (folding simétrico)
--   - setweight A/B/C    → title > category > content (conserva el peso histórico)
--   - índice GIN         → filtrado y ranking en DB, no carga N filas a memoria
--
-- pgvector NO está disponible en este build → FTS es la mejor opción determinista.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() es STABLE, no IMMUTABLE → no se puede usar directo en columnas
-- generadas ni índices funcionales. Wrapper IMMUTABLE (patrón documentado).
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT unaccent('unaccent', $1) $$;

-- Columna tsvector generada: title(A) > category(C) > content(B), accent-folded.
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
      setweight(to_tsvector('spanish', immutable_unaccent(coalesce(title, ''))),    'A') ||
      setweight(to_tsvector('spanish', immutable_unaccent(coalesce(category, ''))), 'C') ||
      setweight(to_tsvector('spanish', immutable_unaccent(coalesce(content, ''))),  'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_kb_search_vector
  ON knowledge_base USING gin (search_vector);

-- Verificación
SELECT
    COUNT(*) AS filas,
    COUNT(*) FILTER (WHERE search_vector IS NOT NULL) AS con_vector
FROM knowledge_base;
