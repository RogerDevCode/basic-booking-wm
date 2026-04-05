# 🔒 Multi-Provider RAG Security Architecture

## 📋 Overview

This document describes the security guarantees for multi-provider RAG (Retrieval-Augmented Generation) in the Booking Titanium system.

---

## 🏗️ Data Isolation Model

### Three-Tier FAQ Classification

| Tier | provider_id | Visibility | Example |
|------|-------------|------------|---------|
| **Public** | `NULL` | All providers | "¿Qué documentos necesito?" |
| **Provider-Specific** | `UUID` | Only that provider | "Dr. García: horario personalizado" |
| **Blocked** | Invalid UUID | Nobody (rejected) | — |

### How RAG Queries Work

```
User asks: "Aceptan seguro?"
    ↓
AI Agent receives: { text: "...", provider_id: "uuid-123" }
    ↓
RAG Query:
  SELECT * FROM knowledge_base
  WHERE is_active = true
    AND (provider_id IS NULL        ← Public FAQs (always included)
      OR provider_id = 'uuid-123')  ← Provider-specific FAQs
    ↓
Results scored by relevance, top 3 returned
    ↓
LLM receives context + answers based on REAL data
```

---

## 🛡️ Security Guarantees

### For Providers (Multi-Tenant Isolation)

| Guarantee | Mechanism | Enforcement |
|-----------|-----------|-------------|
| **FAQ Isolation** | RLS policy `kb_tenant_isolation` | PostgreSQL forces this at query level |
| **Patient Data** | RLS policy `patient_tenant_isolation` | Patients linked to providers |
| **Chat History** | RLS policy `conversation_tenant_isolation` | Conversations per provider |
| **Bookings** | `WHERE provider_id = $1` in all queries | Application + DB constraint |
| **No Cross-Tenant Leaks** | `SET LOCAL app.current_tenant` per transaction | Context dies after COMMIT |

### For Patients (Data Privacy)

| Guarantee | Mechanism |
|-----------|-----------|
| **Booking Privacy** | Patients only see their own bookings |
| **Conversation Privacy** | Chat history tied to patient_id |
| **No Provider Data Leaks** | Provider FAQs only visible to their patients |
| **PII Protection** | Patient names/phones not exposed to other providers |

---

## 🔧 Implementation Details

### Row-Level Security (RLS) Policies

```sql
-- knowledge_base isolation
CREATE POLICY kb_tenant_isolation ON knowledge_base
  FOR SELECT
  USING (
    provider_id IS NULL                                    -- Public FAQs
    OR provider_id = current_setting('app.current_tenant', true)::uuid  -- Provider FAQs
  );
```

### TypeScript Usage Pattern

```typescript
// In AI Agent main.ts:
const { text, chat_id, provider_id } = input;

// RAG automatically filters by provider_id
const ragResult = await buildRAGContext(text, provider_id, 3);
// Returns: { context: string, count: number, hasProviderSpecific: boolean }
```

### RAG Context Builder Logic

```typescript
// rag-context.ts
if (providerId != null) {
  // Return public + provider-specific FAQs
  rows = await sql`
    SELECT * FROM knowledge_base
    WHERE is_active = true
      AND (provider_id IS NULL OR provider_id = ${providerId}::uuid)
  `;
} else {
  // Only public FAQs
  rows = await sql`
    SELECT * FROM knowledge_base
    WHERE is_active = true AND provider_id IS NULL
  `;
}
```

---

## ✅ Security Checklist

| Check | Status | Notes |
|-------|--------|-------|
| RLS enabled on `knowledge_base` | ✅ | Forced, cannot be bypassed |
| RLS enabled on `patients` | ✅ | After migration 007 |
| RLS enabled on `conversations` | ✅ | After migration 007 |
| `SET LOCAL` used in transactions | ✅ | Context isolated per transaction |
| No raw SQL with user input | ✅ | All queries parameterized |
| `provider_id` validated as UUID | ✅ | Zod schema validation |
| Public FAQs readable by all | ✅ | `provider_id IS NULL` clause |
| No cross-tenant data leaks | ✅ | RLS + application checks |

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      PATIENT REQUEST                         │
│  { text: "Aceptan seguro?", provider_id: "uuid-dr-garcia" } │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI AGENT (main.ts)                        │
│  1. Validate input with Zod schema                           │
│  2. Classify intent → general_question                       │
│  3. Build RAG context with provider_id filter                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 RAG CONTEXT BUILDER                          │
│  Query: WHERE (provider_id IS NULL OR provider_id = $1)     │
│  Results:                                                    │
│    ✅ [Public] "¿Aceptan seguro médico? → Sí, Isapre..."    │
│    ✅ [Dr. García] "Convenios especiales → Fonasa 80%..."   │
│    ❌ [Dr. López] "Horario personalizado → NOT INCLUDED"    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM (Groq/OpenAI)                         │
│  System prompt includes RAG context                          │
│  Response based on REAL data from the correct provider       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚨 Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| **No provider_id in request** | Only public FAQs returned |
| **Invalid provider_id** | RLS rejects query, returns empty context |
| **Provider deleted** | Orphaned FAQs become inaccessible (provider_id no longer valid) |
| **FAQ updated to different provider** | Only new provider can access |
| **FAQ set to provider_id = NULL** | Becomes public, all providers can access |

---

## 📝 Migration Steps

1. **Run migration 007**:
   ```bash
   psql $DATABASE_URL -f migrations/007_multi_provider_rag_isolation.sql
   ```

2. **Verify RLS is enabled**:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE schemaname = 'public'
   AND tablename IN ('knowledge_base', 'patients', 'conversations');
   ```

3. **Seed provider-specific FAQs** (optional):
   ```sql
   INSERT INTO knowledge_base (provider_id, category, title, content, is_active)
   VALUES ('uuid-dr-garcia', 'horarios', 'Mi horario especial',
           'Atiendo los lunes de 14:00 a 20:00', true);
   ```
