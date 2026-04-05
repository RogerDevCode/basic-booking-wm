-- ============================================================================
-- Migration 007: Multi-Provider RAG Isolation + RLS Policies
-- Purpose: Ensure each provider only accesses their own knowledge base entries
--          and patient data. Public FAQs (provider_id IS NULL) are shared.
-- Date: 2026-04-05
-- ============================================================================

-- ============================================================================
-- STEP 1: Enable Row-Level Security on knowledge_base
-- ============================================================================

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: RLS Policy for knowledge_base
-- Logic:
--   - Users can read FAQs where provider_id IS NULL (public)
--   - Users can read FAQs where provider_id = their tenant context
--   - Only admins can insert/update/delete (handled by app logic)
-- ============================================================================

-- Read policy: allow reading public FAQs + provider-specific FAQs
DROP POLICY IF EXISTS kb_tenant_isolation ON knowledge_base;
CREATE POLICY kb_tenant_isolation ON knowledge_base
  FOR SELECT
  USING (
    provider_id IS NULL
    OR provider_id = current_setting('app.current_tenant', true)::uuid
  );

-- Write policy: only allow inserts if provider_id is NULL or matches tenant
DROP POLICY IF EXISTS kb_tenant_write ON knowledge_base;
CREATE POLICY kb_tenant_write ON knowledge_base
  FOR ALL
  USING (
    provider_id IS NULL
    OR provider_id = current_setting('app.current_tenant', true)::uuid
  );

-- ============================================================================
-- STEP 3: RLS Policy for patients (patient isolation per provider)
-- ============================================================================

-- Add provider_id to patients table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE patients ADD COLUMN provider_id UUID REFERENCES providers(provider_id);
  END IF;
END $$;

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_tenant_isolation ON patients;
CREATE POLICY patient_tenant_isolation ON patients
  FOR ALL
  USING (
    provider_id IS NULL
    OR provider_id = current_setting('app.current_tenant', true)::uuid
  );

-- ============================================================================
-- STEP 4: RLS Policy for conversations (chat history isolation)
-- ============================================================================

-- Add provider_id to conversations table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN provider_id UUID REFERENCES providers(provider_id);
  END IF;
END $$;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_tenant_isolation ON conversations;
CREATE POLICY conversation_tenant_isolation ON conversations
  FOR ALL
  USING (
    provider_id IS NULL
    OR provider_id = current_setting('app.current_tenant', true)::uuid
  );

-- ============================================================================
-- STEP 5: Create indexes for RLS performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_provider ON knowledge_base(provider_id);
CREATE INDEX IF NOT EXISTS idx_kb_public ON knowledge_base(provider_id) WHERE provider_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_provider ON patients(provider_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider_id);

-- ============================================================================
-- STEP 6: Seed public FAQs (if none exist)
-- ============================================================================

DO $$
BEGIN
  -- Only seed if table is empty
  IF NOT EXISTS (SELECT 1 FROM knowledge_base LIMIT 1) THEN
    INSERT INTO knowledge_base (category, title, content, is_active, embedding) VALUES
    ('servicios',
     '¿Qué servicios médicos ofrecen?',
     'Ofrecemos consulta general, medicina interna, cardiología, pediatría, ginecología, dermatología, psicología, nutrición, fisioterapia, y laboratorio clínico.',
     true,
     ARRAY_FILL(0.01, ARRAY[1536])),
    ('agenda',
     '¿Cómo puedo agendar una cita?',
     'Puedes agendar tu cita a través de nuestro bot de Telegram, llamando a nuestro teléfono, o visitando nuestra recepción.',
     true,
     ARRAY_FILL(0.02, ARRAY[1536])),
    ('seguros',
     '¿Aceptan seguro médico?',
     'Sí, aceptamos Isapre, Fonasa, y convenios con las principales aseguradoras. Consulta con recepción para verificar tu cobertura específica.',
     true,
     ARRAY_FILL(0.03, ARRAY[1536])),
    ('horarios',
     '¿Cuál es el horario de atención?',
     'Atendemos de lunes a viernes de 8:00 a 20:00 y sábados de 9:00 a 14:00. Domingos y festivos cerrado.',
     true,
     ARRAY_FILL(0.04, ARRAY[1536]));
  END IF;
END $$;
