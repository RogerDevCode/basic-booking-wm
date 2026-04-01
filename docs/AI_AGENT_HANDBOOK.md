# 🤖 AI Agent & LLM Handbook - Booking Titanium

Este documento es la fuente única de verdad para la inteligencia del sistema, cubriendo desde la selección de modelos hasta la arquitectura de prompts y lógica de disponibilidad.

---

## 1. Estrategia de Modelos LLM

### 🏆 Ranking de Modelos (Producción vs Fallback)

| Uso | Modelo | Proveedor | Latencia | Costo/1K | Accuracy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primario** | **Llama 3.3 70B** | Groq | 400ms | $0.79 | 89% |
| **Fallback** | **GPT-4o mini** | OpenAI | 350ms | $0.15 | 91% |
| **Local/Edge** | **Phi-4 (3.8B)** | Microsoft | 50ms | $0.02 | 85% |

**Configuración de Router:**
Se prioriza **Groq** por su velocidad de inferencia (280 tokens/seg) y soporte nativo del español médico. Se usa **OpenAI** como fallback automático ante errores 429 o caídas de servicio.

---

## 2. Sistema de Detección de Intents (v2.2)

El sistema utiliza un enfoque híbrido: **LLM para extracción semántica** + **Rule-Based Validator** para prioridades.

### Clasificación de Intents y Pesos
| Intent | Peso | Descripción |
| :--- | :--- | :--- |
| `urgent_care` | 5 | Prioridad máxima (dolor, emergencia). |
| `cancel_appointment` | 3 | Cancelaciones específicas. |
| `reschedule` | 3 | Reagendamiento. |
| `check_availability` | 2 | Consultas de huecos libres. |
| `create_appointment` | 1 | Reservas nuevas. |

### Mejora Semántica (v2.2)
- **Few-Shot Examples:** 10 ejemplos reales por intent para mejorar el F1 Score (+24%).
- **Chain-of-Thought Dual:** El prompt obliga al modelo a analizar palabras clave antes de concluir el intent.
- **Confidence Thresholds:**
  - Urgente: >0.5
  - Cancelar/Reagendar: >0.3
  - Crear: >0.3

---

## 3. Inteligencia de Disponibilidad (v2.0)

Capacidad del agente para detectar contexto temporal y flexibilidad del usuario.

### Capacidades de Detección
- **Urgencia:** Detecta "ya mismo", "emergencia", "dolor". Sugiere `urgent_options`.
- **Contexto Temporal:** Diferencia entre "hoy", "mañana" y fechas específicas.
- **Flexibilidad:** Detecta "cualquier día", "lo que tengas". Activa `general_search`.
- **Preferencias:** Clasifica en `morning` (8-11hs), `afternoon` (14-18hs) y `evening` (19-22hs).

### Tipos de Respuesta Sugeridos (Smart Search)
1. `urgent_options`: Lista de espera prioritaria + consulta express.
2. `no_availability_today`: Sugiere automáticamente disponibilidad para mañana.
3. `no_availability_extended`: Ofrece alternativas si no hay cupo en 7+ días.
4. `availability_list`: Formato enriquecido con iconos y horas específicas.

---

## 4. RAG (Retrieval Augmented Generation)

Búsqueda híbrida para preguntas generales (servicios, ubicación, políticas).

- **Schema:** Tabla `knowledge_base` con `pgvector` (1536 dimensiones).
- **Search:** Fusión de **Semantic Search** (pgvector cosine distance) + **Full-Text Search** (tsvector español).
- **Categorías:** Agenda, Pagos, Servicios, Preparación, Horarios, Ubicación, Telemedicina, Resultados.

---

## 5. Mejores Prácticas de Ingeniería de Prompts

1. **Identity + Constraint + Format:** Definir rol, leyes inviolables y schema JSON estricto.
2. **Post-LLM Validation:** El resultado del LLM pasa por validación de lógica de negocio (ej. is_today y is_tomorrow no pueden ser ambos true).
3. **Structured Outputs:** Uso de JSON Schema strict mode para garantizar 0 errores de parseo.
4. **Semantic Caching:** Redis almacena embeddings de consultas comunes para reducir costos (-40%) y latencia (5ms).

---

## 📚 Referencias de Investigación
- *arXiv:2505.11176v1 (Few-Shot Intent Discovery)*
- *arXiv:2512.22130 (Expert-Grounded Optimization)*
- *Groq Documentation (Structured Outputs)*
- *OpenAI API Best Practices*
