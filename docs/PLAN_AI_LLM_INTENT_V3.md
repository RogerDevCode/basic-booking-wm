# Plan v3 — AI LLM Intent System (Optimizado)

**Fecha:** 2026-04-01
**Origen:** Análisis crítico + Red Team + Devil's Advocate + Best Practices 2026
**Tiempo estimado:** ~3.7 horas
**Archivos finales:** 11

---

## Objetivo

Transformar el AI Agent de rule-based (78% pass rate) a un sistema híbrido LLM + reglas que:
- Use LLM (Groq Llama 3.3 70B) como clasificador primario de intents
- Mantenga reglas como fallback de seguridad
- Preserve toda la lógica existente de entity extraction, context detection y response generation
- Elimine dependencia de Go completamente

---

## Fases con Checklist

### FASE 1: Unificación (20 min)

- [ ] **1.1** Crear `f/internal/ai_agent/constants.ts` con intents unificados
  - Unificar nombres: `reschedule_appointment` → `reschedule`
  - Definir `INTENT` const, `CONFIDENCE_THRESHOLDS`, `NORMALIZATION_MAP`, `PROFANITY_TO_IGNORE`, `OFF_TOPIC_PATTERNS`
- [ ] **1.2** Migrar Red Team tests Go → TypeScript
  - Migrar `main_redteam_test.go` (382 líneas) → `f/internal/ai_agent/redteam.test.ts`
  - Migrar `main_devilsadvocate_test.go` (481 líneas) → `f/internal/ai_agent/devils-advocate.test.ts`
  - Actualizar `main.test.ts` para usar `INTENT.*` constants
- [ ] **1.3** Ejecutar tests y confirmar baseline (78% pass rate)

### FASE 2: System Prompt (45 min)

- [ ] **2.1** Crear `f/internal/ai_agent/prompt-builder.ts`
  - Template con 7 secciones: Identity, Security Boundary, Intent Definitions, Disambiguation Rules, Entity Spec, Few-Shot Examples, Output Schema
  - Separación explícita `SYSTEM_INSTRUCTIONS` vs `USER_DATA` (previene prompt injection)
  - Inyección segura de variables (HTML escape del input)
- [ ] **2.2** Diseñar System Prompt de producción
  - Definiciones operacionales con criterios ✅ SÍ / ❌ NO por intent
  - Reglas de desempate (8 reglas, resuelve bugs del Red Team)
  - 12 few-shot examples estáticos (los más críticos, incluyendo edge cases)
  - JSON output schema estricto
- [ ] **2.3** Crear `f/internal/ai_agent/prompts.ts` (exporta prompt template + examples)

### FASE 3: LLM Client (40 min)

- [ ] **3.1** Crear `f/internal/ai_agent/llm-client.ts`
  - Groq provider (primario): `llama-3.3-70b-versatile`
  - OpenAI provider (fallback): `gpt-4o-mini`
  - `callWithFallback()`: intenta Groq → si falla → OpenAI → si falla → throw
  - Temperature 0.0, max_tokens 512, timeout 15s, retry 2 intentos
- [ ] **3.2** Crear `f/internal/ai_agent/llm-classifier.ts`
  - `classifyWithLLM(text, ragContext?)`: llama al LLM con el prompt construido
  - Limpieza de markdown code blocks
  - Parseo JSON + validación Zod estricta
  - Validación post-LLM: intent válido, confidence en [0,1], entities sanas
- [ ] **3.3** NO implementar model cascading (Groq → OpenAI solo como fallback de infraestructura, no por confidence)

### FASE 4: Guardrails (25 min)

- [ ] **4.1** Crear `f/internal/ai_agent/guardrails.ts`
  - Input: detectar prompt injection patterns (`ignore previous`, `system prompt`, etc.)
  - Input: sanitizar zero-width chars, RTL override, unicode smuggling
  - Input: rate limiting conceptual por chat_id
  - Output: validar schema completo
  - Output: detectar leakage de system prompt
  - Output: sanitizar follow_up (máx 200 chars, sin HTML)
- [ ] **4.2** Cross-check: si LLM dice `urgent_care` pero no hay urgency words → bajar confidence

### FASE 5: Sistema Híbrido (40 min)

- [ ] **5.1** Reescribir `f/internal/ai_agent/main.ts`
  - Flujo: validate → input guardrails → fast-path → LLM → fallback → merge → context → respond → return
  - Fast-path: greeting/farewell/thank_you puros (≤4 palabras, sin booking keywords) → ~30% ahorro
  - Fast-path: off-topic check + profanity filter (ya existentes)
  - Primary: LLM call con prompt de producción
  - Fallback: si LLM falla → `detectIntent` rule-based actual
  - Merge: LLM decide intent, rules extraen entities detalladas, rules detectan contexto
- [ ] **5.2** Preservar intactos:
  - `extractEntities()` — regex para fechas, horas, IDs
  - `detectContext()` — is_today, is_tomorrow, time_preference
  - `suggestResponseType()` — 12 tipos de respuesta
  - `generateAIResponse()` — respuestas contextualizadas
- [ ] **5.3** Eliminar código Go obsoleto (marcar para borrado posterior)

### FASE 6: Testing (30 min)

- [ ] **6.1** Ejecutar 100 queries existentes → confirmar pass rate ≥ 92%
- [ ] **6.2** Ejecutar 28 Red Team tests migrados → 100% pass
- [ ] **6.3** Consistency test: misma query 100 veces → mismo resultado
- [ ] **6.4** Cross-provider test: Groq vs OpenAI → mismo intent en casos claros
- [ ] **6.5** Performance test: P50 < 500ms, P95 < 2s

### FASE 7: Observabilidad (20 min)

- [ ] **7.1** Crear `f/internal/ai_agent/tracing.ts`
  - Log estructurado por request: `{ chat_id, intent, confidence, provider, latency_ms, tokens_in, tokens_out, cached, fallback_used }`
- [ ] **7.2** Métricas clave:
  - LLM success rate (alerta si < 95%)
  - Fallback rate (alerta si > 20%)
  - Avg confidence (alerta si < 0.7)
  - P95 latency (alerta si > 2s)
- [ ] **7.3** Actualizar `docs/AI_AGENT_HANDBOOK.md` con nueva arquitectura

---

## Archivos Finales

| Archivo | Acción | Descripción |
|---|---|---|
| `f/internal/ai_agent/constants.ts` | **Crear** | Intents unificados, thresholds, maps |
| `f/internal/ai_agent/prompt-builder.ts` | **Crear** | Constructor del system prompt con security boundary |
| `f/internal/ai_agent/prompts.ts` | **Crear** | Exporta prompt template + few-shot examples |
| `f/internal/ai_agent/llm-client.ts` | **Crear** | Groq + OpenAI con fallback de infraestructura |
| `f/internal/ai_agent/llm-classifier.ts` | **Crear** | Clasificación LLM + validación Zod |
| `f/internal/ai_agent/guardrails.ts` | **Crear** | Input/Output validation + injection detection |
| `f/internal/ai_agent/tracing.ts` | **Crear** | Request tracing y métricas |
| `f/internal/ai_agent/main.ts` | **Reescribir** | Flujo híbrido LLM + reglas |
| `f/internal/ai_agent/redteam.test.ts` | **Crear** | Migrar red team de Go a TS |
| `f/internal/ai_agent/devils-advocate.test.ts` | **Crear** | Migrar devil's advocate de Go a TS |
| `docs/AI_AGENT_HANDBOOK.md` | **Actualizar** | Documentación del nuevo sistema |

---

## Decisiones Arquitectónicas

| Decisión | Racional |
|---|---|
| Few-shot estático (no dinámico) | 12 ejemplos caben en prompt, dinámico es over-engineering |
| Sin model cascading | Duplica latencia/costo, fallback a rules es suficiente |
| Sin CoT en output JSON | Aumenta costo 20% sin mejorar accuracy de clasificación |
| Sin YAML version control | Git + feature flags es suficiente |
| Temperature 0.0 | Clasificación debe ser determinística |
| Groq primario, OpenAI fallback | Groq es más rápido y soporta español médico |
| Fast-path para greetings | ~30% de mensajes, ahorra llamadas LLM innecesarias |

---

## Métricas Esperadas

| Métrica | Actual (rule-based) | Esperado (híbrido) |
|---|---|---|
| Pass rate (100 tests) | 78% | **92-96%** |
| Ambigüedad resuelta | ~60% | **~90%** |
| Latencia P50 | ~5ms | **~320ms** (ponderado con fast-path) |
| Latencia P95 | ~5ms | **~1500ms** |
| Fast-path hit rate | 0% | **~30%** |
| Costo por mensaje | $0 | **~$0.0004** (solo cuando LLM necesario) |
