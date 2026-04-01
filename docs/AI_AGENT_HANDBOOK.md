# 🤖 AI Agent & LLM Handbook - Booking Titanium

**Versión:** v3.0 (Híbrido LLM + Reglas)
**Fecha:** 2026-04-01
**Estado:** Producción

---

## 1. Estrategia de Modelos LLM

### 🏆 Ranking de Modelos (Producción vs Fallback)

| Uso | Modelo | Proveedor | Latencia | Costo/1K | Accuracy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primario** | **Llama 3.3 70B** | Groq | 400ms | $0.79 | 89% |
| **Fallback** | **GPT-4o mini** | OpenAI | 350ms | $0.15 | 91% |

**Configuración de Router:**
Se prioriza **Groq** por su velocidad de inferencia (280 tokens/seg) y soporte nativo del español médico. Se usa **OpenAI** como fallback automático ante errores 429 o caídas de servicio.

---

## 2. Arquitectura Híbrida (v3.0)

### Flujo de Clasificación

```
┌──────────────────────────────────────────────────────────────┐
│                    AI AGENT v3.0 FLOW                        │
│                                                              │
│  1. VALIDATE input (Zod schema)                              │
│  2. INPUT GUARDRAILS (injection, unicode, length)            │
│  3. FAST-PATH: greeting/farewell/thankyou/off-topic          │
│     → ~30% de mensajes, sin llamada LLM (~1ms)               │
│  4. LLM PRIMARY: Groq Llama 3.3 70B                          │
│     → System prompt con 7 secciones                          │
│     → Temperature 0.0, max_tokens 512                        │
│     → json_object response format                            │
│  5. OUTPUT GUARDRAILS: schema validation, leakage check      │
│  6. FALLBACK: Si LLM falla → detectIntentRules (keyword)     │
│  7. MERGE: LLM intent + rule-based entities + context        │
│  8. RESPONSE: generateAIResponse + suggestResponseType        │
│  9. TRACE: Log estructurado con métricas                     │
│  10. RETURN: Resultado completo                              │
└──────────────────────────────────────────────────────────────┘
```

### Intents (Single Source of Truth)

| Intent | Valor | Descripción |
| :--- | :--- | :--- |
| `create_appointment` | `create_appointment` | Agendar cita nueva |
| `cancel_appointment` | `cancel_appointment` | Anular cita existente |
| `reschedule` | `reschedule` | Cambiar cita a otro día/hora |
| `check_availability` | `check_availability` | Consultar disponibilidad |
| `urgent_care` | `urgent_care` | Urgencia médica real |
| `general_question` | `general_question` | Pregunta general |
| `greeting` | `greeting` | Saludo puro |
| `farewell` | `farewell` | Despedida pura |
| `thank_you` | `thank_you` | Agradecimiento puro |
| `unknown` | `unknown` | No se puede determinar |

### Confidence Thresholds

| Intent | Umbral |
| :--- | :--- |
| `urgent_care` | 0.5 |
| `cancel_appointment` | 0.5 |
| `reschedule` | 0.5 |
| `create_appointment` | 0.3 |
| `check_availability` | 0.3 |
| `greeting/farewell/thank_you` | 0.5 |
| `unknown` | 0.0 |

---

## 3. System Prompt (7 Secciones)

1. **Identity & Role** — Clasificador de intenciones médico en español
2. **Security Boundary** — USER_DATA marking (previene prompt injection)
3. **Intent Definitions** — Criterios ✅ SÍ / ❌ NO por intent
4. **Disambiguation Rules** — 8 reglas de desempate (resuelve bugs del Red Team)
5. **Entity Spec** — Qué extraer: date, time, booking_id, patient_name, service_type
6. **Few-Shot Examples** — 15 ejemplos estáticos cubriendo todos los intents + edge cases
7. **Output Schema** — JSON estricto: intent, confidence, entities, needs_more, follow_up

---

## 4. Guardrails

### Input Validation
- Longitud: 2-500 caracteres
- Prompt injection: 7 patrones detectados (`ignore previous`, `developer mode`, etc.)
- Unicode peligroso: 8 caracteres bloqueados (zero-width, RTL override, etc.)

### Output Validation
- JSON parsing con sanitización (markdown code blocks, preámbulos)
- Schema validation: intent válido, confidence en [0,1], entities es objeto
- Leakage detection: 5 patrones de sistema prompt
- Cross-check: si `urgent_care` sin urgency words → bajar confidence

---

## 5. Observabilidad (Tracing)

Cada request genera un trace estructurado:

```json
{
  "chat_id": "123456",
  "intent": "create_appointment",
  "confidence": 0.95,
  "provider": "groq",
  "latency_ms": 412,
  "tokens_in": 520,
  "tokens_out": 85,
  "cached": false,
  "fallback_used": false,
  "timestamp": "2026-04-01T04:35:01.288Z"
}
```

### Métricas Clave
| Métrica | Alerta si |
| :--- | :--- |
| LLM success rate | < 95% |
| Fallback rate | > 20% |
| Avg confidence | < 0.7 |
| P95 latency | > 2s |

---

## 6. Archivos del Sistema

| Archivo | Descripción |
| :--- | :--- |
| `constants.ts` | Intents unificados, thresholds, keywords, maps |
| `prompt-builder.ts` | Constructor del system prompt con 7 secciones |
| `llm-client.ts` | Groq + OpenAI con fallback y retry |
| `guardrails.ts` | Input/Output validation + injection detection |
| `tracing.ts` | Request tracing estructurado |
| `main.ts` | Flujo híbrido LLM + reglas |
| `main.test.ts` | 41 tests de funcionalidad |
| `main.comprehensive.test.ts` | 100 queries de validación |
| `redteam.test.ts` | 27 tests de colisión y edge cases |

---

## 7. Testing

| Suite | Tests | Estado |
| :--- | :--- | :--- |
| `main.test.ts` | 41 | ✅ PASS |
| `main.comprehensive.test.ts` | 100 | ✅ PASS |
| `redteam.test.ts` | 27 | ✅ PASS |
| **Total** | **168** | **✅ PASS** |

---

## 8. Decisiones Arquitectónicas

| Decisión | Racional |
| :--- | :--- |
| Few-shot estático (no dinámico) | 15 ejemplos caben en prompt, dinámico es over-engineering |
| Sin model cascading | Duplica latencia/costo, fallback a rules es suficiente |
| Sin CoT en output JSON | Aumenta costo 20% sin mejorar accuracy de clasificación |
| Temperature 0.0 | Clasificación debe ser determinística |
| Groq primario, OpenAI fallback | Groq es más rápido y soporta español médico |
| Fast-path para greetings | ~30% de mensajes, ahorra llamadas LLM innecesarias |
