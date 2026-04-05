# Semantic Few-Shot Sampling — Plan de Implementación Futura (Opción B)

**Estado:** Postergado (prioridad baja)
**Fecha de creación:** 2026-04-05
**Ganancia esperada:** +1-3% accuracy (IntentGPT, arXiv 2411.10670)
**Costo estimado:** ~$0.0001 por query (OpenAI text-embedding-3-small)

---

## ¿Por qué hay mejora?

### Problema actual (Opción A — ejemplos estáticos)
El prompt incluye **25 ejemplos fijos** en la sección `<FEW_SHOT_EXAMPLES>`. El LLM los usa como referencia para clasificar cualquier mensaje, sin importar qué tan diferente sea del contexto del ejemplo.

**Ejemplo del problema:**
- Usuario dice: `"me duele la espalda baja desde ayer"`
- El prompt le muestra los mismos 25 ejemplos a todos los usuarios
- El LLM tiene que hacer el trabajo de mapear semánticamente "dolor de espalda" → `urgent_care`
- Si los ejemplos de `urgent_care` hablan de "muela" y "guata", el LLM puede no hacer la conexión

### Solución (Opción B — ejemplos dinámicos)
Antes de construir el prompt, se seleccionan los **3 ejemplos más semánticamente cercanos** al mensaje del usuario usando cosine similarity sobre embeddings de OpenAI.

**Ejemplo de la mejora:**
- Usuario dice: `"me duele la espalda baja desde ayer"`
- El sistema calcula embeddings y encuentra que los ejemplos más cercanos son:
  1. `"Me duele mucho la muela, necesito atención ya"` → `urgent_care`
  2. `"tengo un dolor insoportable de guata"` → `urgent_care`
  3. `"necesito cita urgente pa mañana"` → `create_appointment`
- El prompt inyecta SOLO estos 3 ejemplos relevantes
- El LLM tiene contexto mucho más preciso → mejor clasificación

### ¿Por qué funciona mejor?

1. **Reducción de ruido cognitivo**: El LLM no tiene que ignorar 22 ejemplos irrelevantes
2. **Priming semántico**: Los ejemplos cercanos activan los patrones correctos en el modelo
3. **Token efficiency**: 3 ejemplos vs 25 = ~60% menos tokens en el prompt
4. **Adaptabilidad**: Nuevos intents o edge cases se benefician automáticamente

**Evidencia académica:**
- IntentGPT (arXiv 2411.10670): +3-5% ACC con Semantic Few-Shot Sampling
- Skill-KNN (EMNLP 2023): +5-8% con skill-based descriptions
- Cleanlab: La calidad de los ejemplos importa más que la cantidad

---

## Arquitectura de Implementación

### Flujo

```
User Message → OpenAI text-embedding-3-small → Embedding (1536 dim)
                                                      ↓
                    Cosine similarity vs 25 pre-computed embeddings
                                                      ↓
                                              Top-3 más cercanos
                                                      ↓
                                    Inject into <FEW_SHOT_EXAMPLES>
                                                      ↓
                                              Build prompt → LLM call
```

### Paso 1: Generar embeddings de los 25 ejemplos (one-time)

```bash
# Usar OpenAI API una sola vez (~$0.0001 costo total)
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": ["Hola", "ola dotor", "Quiero agendar...", ...],
    "model": "text-embedding-3-small"
  }' > f/internal/ai_agent/fewshot-embeddings.json
```

### Paso 2: Modificar `llm-client.ts` para generar embedding del user message

```typescript
async function embedText(text: string): Promise<number[]> {
  const openaiKey = getOpenAIKey();
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
      dimensions: 1536,
    }),
  });
  const data = await response.json() as { data: { embedding: number[] }[] };
  return data[0].embedding;
}
```

### Paso 3: Modificar `semantic-sampler.ts`

```typescript
export async function selectFewShotExamplesDynamic(
  userMessage: string,
  k: number = 3,
): Promise<ScoredExample[]> {
  // 1. Embed user message via OpenAI API
  const userEmbedding = await embedText(userMessage);

  // 2. Load pre-computed embeddings
  const data = loadEmbeddings(); // fewshot-embeddings.json

  // 3. Cosine similarity
  const scored = data.examples.map((ex) => ({
    text: ex.text,
    intent: ex.intent,
    similarity: cosineSimilarity(userEmbedding, ex.embedding),
  }));

  // 4. Sort and return top-k
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
```

### Paso 4: Integrar con `prompt-builder.ts`

```typescript
export async function buildSystemPromptDynamic(userMessage: string): Promise<string> {
  const examples = await selectFewShotExamplesDynamic(userMessage, 3);
  const fewShotSection = buildFewShotSectionFromExamples(examples);

  return `${OBJECTIVE_PERSONA}\n${ERROR_TOLERANCE}\n...${fewShotSection}...`;
}
```

---

## Tradeoffs

| Aspecto | Opción A (Actual) | Opción B (Futura) |
|---------|-------------------|-------------------|
| **Latencia adicional** | 0ms | ~200-500ms (API call) |
| **Costo por query** | $0 | ~$0.0001 |
| **Accuracy** | Baseline | +1-3% |
| **Complejidad** | Mínima | Moderada |
| **Dependencias externas** | Ninguna | OpenAI API |
| **Token usage** | ~2500 tokens (25 ejemplos) | ~300 tokens (3 ejemplos) |
| **Costo LLM reducido** | - | Ahorro de ~$0.0002/query en tokens |

### ¿Vale la pena?

**Net cost analysis:**
- Embedding API: +$0.0001/query
- Token savings (22 ejemplos menos): -$0.0002/query
- **Net: -$0.0001/query (ahorro)** + mejora de accuracy

**Conclusión:** La Opción B es **rentable** si el volumen de queries justifica la latencia adicional de ~300ms.

---

## Archivos existentes (reutilizables)

| Archivo | Estado | Uso futuro |
|---------|--------|------------|
| `f/internal/ai_agent/semantic-sampler.ts` | ✅ Existe | Reemplazar keyword embedding con OpenAI embeddings |
| `f/internal/ai_agent/semantic-sampler.test.ts` | ✅ Existe | Actualizar tests con embeddings reales |
| `scripts/generate-fewshot-embeddings.py` | ⚠️ Existe | Reemplazar con script de OpenAI API |
| `f/internal/ai_agent/prompt-builder.ts` | ✅ Existe | Agregar `buildSystemPromptDynamic()` |

---

## Cuándo implementar

**Señales de que es momento:**
1. Accuracy del clasificador baja de 90% en producción
2. Volumen de queries > 1000/mes (el ahorro de tokens compensa)
3. Se agregan nuevos intents o se expande el dominio
4. Los usuarios reportan clasificaciones incorrectas frecuentes

**No implementar si:**
- Accuracy actual > 95% con ejemplos estáticos
- Latencia es crítica (< 1s end-to-end)
- No hay acceso a OpenAI API key adicional
