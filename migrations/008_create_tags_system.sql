-- ============================================================================
-- Migration: 008_create_tags_system.sql
-- Purpose: Generic tag system for notes, configurable by admin
-- Severity: HIGH — enables flexible categorization across domains
-- Date: 2026-04-07
--
-- Design: Domain-agnostic. Tags can be used for medical notes, legal cases,
-- customer service tickets, or any future domain.
--
-- Structure:
--   tag_categories  → Groups of tags (e.g., "Diagnosis", "Treatment", "Priority")
--   tags            → Individual tags within categories
--   note_tags       → M2M junction between service_notes and tags
--
-- Admin can CRUD categories and tags via web_admin_tags script.
-- Providers select tags from dropdown when creating/editing notes.
-- ============================================================================

BEGIN;

-- ── 1. Tag Categories ──────────────────────────────────────────────────────
-- Groups tags logically. Examples: "Diagnosis", "Treatment", "Priority", "Follow-up"
CREATE TABLE IF NOT EXISTS tag_categories (
    category_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL UNIQUE,
    description   TEXT,
    is_active     BOOLEAN DEFAULT true,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Tags ────────────────────────────────────────────────────────────────
-- Individual tags. Examples: "Allergy", "Chronic", "Urgent", "Follow-up Required"
CREATE TABLE IF NOT EXISTS tags (
    tag_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID NOT NULL REFERENCES tag_categories(category_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    color         TEXT DEFAULT '#808080',  -- HEX color for UI display
    is_active     BOOLEAN DEFAULT true,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, name)
);

-- ── 3. Note-Tag Junction (M2M) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_tags (
    note_id       UUID NOT NULL REFERENCES service_notes(note_id) ON DELETE CASCADE,
    tag_id        UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
    assigned_at   TIMESTAMPTZ DEFAULT NOW(),
    assigned_by   UUID,  -- user_id who assigned this tag
    PRIMARY KEY (note_id, tag_id)
);

-- ── 4. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX idx_tags_category ON tags(category_id, is_active, sort_order);
CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX idx_note_tags_note ON note_tags(note_id);

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_categories FORCE ROW LEVEL SECURITY;

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags FORCE ROW LEVEL SECURITY;

-- Categories: read-only for all tenants, write only by admin
DROP POLICY IF EXISTS tenant_isolation_tag_categories ON tag_categories;
CREATE POLICY tenant_isolation_tag_categories ON tag_categories
  USING (true)
  WITH CHECK (false);  -- Admin-only writes handled by app logic

-- Tags: read-only for all tenants
DROP POLICY IF EXISTS tenant_isolation_tags ON tags;
CREATE POLICY tenant_isolation_tags ON tags
  USING (true)
  WITH CHECK (false);

-- Note tags: tenant isolation via service_notes
DROP POLICY IF EXISTS tenant_isolation_note_tags ON note_tags;
CREATE POLICY tenant_isolation_note_tags ON note_tags
  USING (
    EXISTS (
      SELECT 1 FROM service_notes sn
      WHERE sn.note_id = note_tags.note_id
      AND sn.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_notes sn
      WHERE sn.note_id = note_tags.note_id
      AND sn.provider_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- ── 6. Seed default medical tags ───────────────────────────────────────────
-- These are domain-specific examples; other domains can have their own tags.

INSERT INTO tag_categories (name, description, sort_order) VALUES
  ('Diagnóstico', 'Etiquetas relacionadas con diagnóstico del paciente', 1),
  ('Tratamiento', 'Etiquetas relacionadas con tratamiento prescrito', 2),
  ('Prioridad', 'Nivel de urgencia de la nota', 3),
  ('Seguimiento', 'Etiquetas para notas de seguimiento', 4),
  ('Administrativo', 'Etiquetas administrativas', 5)
ON CONFLICT (name) DO NOTHING;

-- Insert tags for each category
DO $$
DECLARE
  diag_cat UUID;
  treat_cat UUID;
  priority_cat UUID;
  follow_cat UUID;
  admin_cat UUID;
BEGIN
  SELECT category_id INTO diag_cat FROM tag_categories WHERE name = 'Diagnóstico' LIMIT 1;
  SELECT category_id INTO treat_cat FROM tag_categories WHERE name = 'Tratamiento' LIMIT 1;
  SELECT category_id INTO priority_cat FROM tag_categories WHERE name = 'Prioridad' LIMIT 1;
  SELECT category_id INTO follow_cat FROM tag_categories WHERE name = 'Seguimiento' LIMIT 1;
  SELECT category_id INTO admin_cat FROM tag_categories WHERE name = 'Administrativo' LIMIT 1;

  -- Diagnóstico
  INSERT INTO tags (category_id, name, description, color, sort_order) VALUES
    (diag_cat, 'Alergia', 'Paciente con alergias conocidas', '#F44336', 1),
    (diag_cat, 'Crónico', 'Condición crónica del paciente', '#FF9800', 2),
    (diag_cat, 'Agudo', 'Condición aguda que requiere atención inmediata', '#E91E63', 3),
    (diag_cat, 'Preventivo', 'Consulta de prevención', '#4CAF50', 4),
    (diag_cat, 'Remisión', 'Paciente remitido a especialista', '#9C27B0', 5)
  ON CONFLICT (category_id, name) DO NOTHING;

  -- Tratamiento
  INSERT INTO tags (category_id, name, description, color, sort_order) VALUES
    (treat_cat, 'Farmacológico', 'Tratamiento con medicamentos', '#2196F3', 1),
    (treat_cat, 'Terapia', 'Tratamiento con terapia física/psicológica', '#00BCD4', 2),
    (treat_cat, 'Cirugía', 'Procedimiento quirúrgico requerido', '#F44336', 3),
    (treat_cat, 'Observación', 'Solo observación sin tratamiento activo', '#9E9E9E', 4)
  ON CONFLICT (category_id, name) DO NOTHING;

  -- Prioridad
  INSERT INTO tags (category_id, name, description, color, sort_order) VALUES
    (priority_cat, 'Urgente', 'Requiere atención inmediata', '#F44336', 1),
    (priority_cat, 'Alta', 'Requiere atención pronto', '#FF9800', 2),
    (priority_cat, 'Normal', 'Atención estándar', '#4CAF50', 3),
    (priority_cat, 'Baja', 'Puede esperar', '#9E9E9E', 4)
  ON CONFLICT (category_id, name) DO NOTHING;

  -- Seguimiento
  INSERT INTO tags (category_id, name, description, color, sort_order) VALUES
    (follow_cat, 'Requiere seguimiento', 'Necesita cita de seguimiento', '#FF9800', 1),
    (follow_cat, 'En tratamiento', 'Paciente actualmente en tratamiento', '#2196F3', 2),
    (follow_cat, 'Alta médica', 'Paciente dado de alta', '#4CAF50', 3),
    (follow_cat, 'Reingreso', 'Paciente que regresa tras alta', '#9C27B0', 4)
  ON CONFLICT (category_id, name) DO NOTHING;

  -- Administrativo
  INSERT INTO tags (category_id, name, description, color, sort_order) VALUES
    (admin_cat, 'Seguro médico', 'Nota relacionada con seguro', '#607D8B', 1),
    (admin_cat, 'Pago pendiente', 'Pago de consulta pendiente', '#FF9800', 2),
    (admin_cat, 'Consentimiento', 'Consentimiento informado firmado', '#4CAF50', 3)
  ON CONFLICT (category_id, name) DO NOTHING;
END $$;

DO $$
BEGIN
  RAISE NOTICE '✅ Tag system created: tag_categories, tags, note_tags tables with RLS and default medical tags';
END $$;

COMMIT;
