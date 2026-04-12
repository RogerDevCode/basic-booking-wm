# INVESTIGACIÓN: Manejo de Dualidad Determinista vs LLM en Chatbots de Booking

**Fecha:** 2026-04-12
**Problema:** `/start` → menú → "1" (pedir hora) → especialidades → "1" → **LOOP** (repite especialidades)
**Causa raíz:** No hay máquina de estado que controle los pasos del wizard. El AI Agent clasifica el intent pero no sabe en qué paso del flujo multi-turno está el usuario.

---

## 1. El Espectro: No es Binario

La industria no ve esto como "determinista O LLM", sino como un **espectro** dentro de sistemas compuestos (Compound AI Systems).

| Extremo | Patrón | Cuándo usar |
|---|---|---|
| **100% Determinista** | Máquina de estado con transiciones fijas | Flujos de booking, pagos, confirmaciones |
| **Híbrido** | Router determinista + LLM para sub-tareas | Clasificación de intent + ejecución determinista |
| **100% Agentic** | LLM planifica y ejecuta todo | Consultas abiertas, RAG, resolución de problemas |

**Consenso de la comunidad:** los sistemas de producción rara vez están en los extremos. La regla es: *"Start deterministic & iterate. Add agency only where testing proves it improves outcomes."* (Deepset, 2025)

---

## 2. Cinco Líneas de Pensamiento / Opciones Arquitecturales

### OPCIÓN A: State Machine Determinista Pura

**Patrón:** XState / Statechart para el wizard completo.
**Cómo funciona:**

```
IDLE ──/crear_cita──→ SELECTING_SPECIALTY ──/number──→ SELECTING_DOCTOR
                                                          ──/number──→ SELECTING_TIME
                                                                          ──/number──→ CONFIRMATION
                                                                                          ──/yes──→ BOOKING_CREATED
                                                                                          ──/no──→ SELECTING_TIME
```

- **Cada transición es determinista**: el input "1" se interpreta diferente según el estado actual
- **LLM solo se usa para clasificación de intent** en la entrada
- **Nada de LLM en la generación de respuestas** del wizard

**Ventajas:**
- 100% predecible, 0 alucinaciones
- Fácil de testear, depurar y auditar
- Latencia mínima en los pasos del wizard (~1ms)

**Desventajas:**
- No maneja digresiones naturales ("¿y si cambio de opinión?")
- Si el usuario escribe "cardiología" en vez de "1", no lo entiende (a menos que el state machine tenga un parser de entidades)
- Rígido — cada nuevo paso requiere modificar la máquina

**Referencia:** Praetorian Development Platform — "Thin Agent / Fat Platform": LLM como kernel no determinista envuelto en runtime determinista.

---

### OPCIÓN B: Router con Discriminador de Estado (Hybrid Pattern)

**Patrón:** El router no solo decide "determinista vs AI", sino que **inyecta el estado actual** en la respuesta.

```
Input: "1"
Estado actual: { active_flow: "booking_wizard", flow_step: 1 }
               ↓
Router: "1" + flow_step=1 → "Elige doctor" (respuesta determinista basada en estado)
               ↓
Estado actualiza: { active_flow: "booking_wizard", flow_step: 2 }
```

**Cómo funciona:**
1. El router recibe el texto Y el estado conversacional
2. Si `active_flow` está activo, **ignora la clasificación NLU** y usa la lógica del paso actual
3. La respuesta se genera desde templates deterministas, no desde el LLM
4. El LLM solo se invoca si `active_flow = "none"` (texto libre sin contexto)

**Ventajas:**
- Maneja el wizard correctamente sin LLM
- El estado persiste entre turnos (Redis)
- El LLM sigue disponible para texto libre

**Desventajas:**
- El router se vuelve más complejo (debe conocer la lógica de cada paso)
- Si el estado se corrompe o pierde, el wizard se rompe

**Referencia:** Rasa blog — "Hybrid Architecture": orquestación que decide dinámicamente entre lógica determinista y LLM basado en predictibilidad y riesgo.

---

### OPCIÓN C: Blueprint First, Model Second (Source Code Agent)

**Patrón:** El flujo del wizard es código fuente explícito (no prompts). El LLM se invoca solo en nodos predefinidos.

```typescript
// Blueprint determinista
const bookingWizard = new StateMachine({
  steps: [
    { id: 'specialty',  prompt: 'Elige especialidad',  parser: parseNumber },
    { id: 'doctor',     prompt: 'Elige doctor',         parser: parseNumber },
    { id: 'time',       prompt: 'Elige hora',           parser: parseTime },
    { id: 'confirm',    prompt: 'Confirmar?',           parser: parseYesNo },
  ],
  onInput: (state, input) => {
    // LLM se invoca SOLO para parsear inputs complejos
    const parsed = state.currentStep.parser(input);
    if (parsed.ok) {
      state.data[state.currentStep.id] = parsed.value;
      state.advance();
    } else {
      // Fallback: LLM intenta interpretar
      const [err, nlu] = await classifyWithLLM(input);
      // ...
    }
  }
});
```

**Ventajas:**
- El blueprint es el "single source of truth"
- Validación gates explícitas en cada paso
- El LLM nunca decide el flujo de ejecución

**Desventajas:**
- Requiere escribir y mantener el blueprint
- Menos flexible para cambios dinámicos

**Referencia:** Arxiv 2508.02721 — "Blueprint First, Model Second": LLM invocado solo en nodos predefinidos, nunca decide el path de ejecución.

---

### OPCIÓN D: Multi-Agent Orchestrator con Especialización

**Patrón:** Agentes especializados por dominio, orquestados por un router.

```
User Input
    ↓
[Orchestrator]
    ├── "¿Es texto libre?" → NLU Agent (LLM)
    ├── "¿Está en un wizard?" → Wizard Agent (determinista)
    ├── "¿Es callback?" → Callback Agent (determinista)
    └── "¿Es emergencia?" → Escalation Agent (LLM + humano)
```

Cada agente tiene su propio estado y lógica:
- **Wizard Agent:** Máquina de estado para booking (specialty → doctor → time → confirm)
- **NLU Agent:** LLM para clasificación de intent en texto libre
- **Callback Agent:** Procesa botones inline directamente

**Ventajas:**
- Separación clara de responsabilidades
- Cada agente se puede testear independientemente
- Escalable — nuevos agentes para nuevos dominios

**Desventajas:**
- Mayor complejidad operacional
- Overhead de coordinación entre agentes
- El orquestador en sí necesita lógica de routing

**Referencia:** Medium — "The Orchestrator Pattern": routing de conversaciones a agentes especializados con 95%+ accuracy.

---

### OPCIÓN E: Context-Aware LLM con Inyección de Estado (Prompt Engineering)

**Patrón:** El LLM recibe el estado conversacional en el prompt y genera respuestas contextualizadas.

```
System Prompt:
"El usuario está en el paso 2 de 4 del flujo de agendar cita.
 Ya seleccionó Cardiología (paso 1).
 Ahora debe seleccionar un doctor.
 Doctores disponibles: Dr. Pérez, Dra. Kim.
 Responde SOLO con la lista de doctores y pide que elija."

User Input: "1"
```

**Ventajas:**
- Más flexible — el LLM puede manejar variaciones naturales
- No requiere estado explícito en el código
- Respuestas más naturales y contextuales

**Desventajas:**
- **Lento** (~2s por turno del wizard)
- **Caro** — cada paso del wizard consume tokens
- **Impredecible** — el LLM puede generar respuestas inesperadas
- **Difícil de testear** — las respuestas varían

---

## 3. Comparación Directa

| Criterio | A: State Machine | B: Router + Estado | C: Blueprint | D: Multi-Agent | E: LLM + Estado |
|---|---|---|---|---|---|
| **Predictibilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Latencia (wizard)** | ~1ms | ~5ms | ~2ms | ~10ms | ~2000ms |
| **Costo por turno** | $0 | $0 | $0 | $0 | ~$0.002 |
| **Flexibilidad** | ⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Complejidad** | Baja | Media | Media | Alta | Baja |
| **Testeabilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Maneja digresiones** | ❌ | ⚠️ Parcial | ⚠️ Parcial | ✅ | ✅ |

---

## 4. Recomendación: Opción B + A (Híbrido)

**Lo que la comunidad recomienda para sistemas de booking médico:**

```
Capa 1: Router determinista (ya implementado)
         ├── Callbacks → directo (0ms)
         ├── Comandos → directo (0ms)
         └── Menús → directo (0ms)

Capa 2: State Machine para wizards (NUEVO)
         ├── booking_wizard: specialty → doctor → time → confirm
         ├── reschedule_flow: booking → new_date → confirm
         └── cancellation_flow: booking → reason → confirm

Capa 3: AI Agent con contexto (ya implementado, pero mejorado)
         └── Texto libre → NLU → clasifica intent → activa Capa 2
```

**Por qué:**
1. El wizard de booking es **predecible y estructurado** — no necesita LLM
2. El router ya existe y funciona — solo necesita inyectar el estado
3. El AI Agent sigue disponible para texto libre — pero no genera respuestas del wizard
4. Latencia del wizard: ~5ms (no ~2000ms)
5. 100% testeable y auditable

**Lo que NO se recomienda:** Opción E (LLM + estado) para wizards de booking. La comunidad es unánime: *"Deterministic foundations minimize cost and overhead. Add complexity only where it demonstrably moves the needle."* (Deepset)

---

## 5. Fuentes

| Fuente | Tipo | Fecha |
|---|---|---|
| [Rasa Blog — LLM Chatbot Architecture](https://rasa.com/blog/llm-chatbot-architecture) | Blog técnico | 2025-09 |
| [Praetorian — Deterministic AI Orchestration](https://www.praetorian.com/blog/deterministic-ai-orchestration-a-platform-architecture-for-autonomous-development/) | Arquitectura | 2026-02 |
| [Deepset — AI Agents and Deterministic Workflows](https://www.deepset.ai/blog/ai-agents-and-deterministic-workflows-a-spectrum) | Análisis | 2025-05 |
| [Arxiv 2508.02721 — Blueprint First, Model Second](https://arxiv.org/html/2508.02721v1) | Paper académico | 2025-08 |
| [Medium — The Orchestrator Pattern](https://medium.com/@akki7272/the-orchestrator-pattern-routing-conversations-to-specialized-ai-agents-985fcdf0d8ad) | Patrón | 2025-11 |
| [Wendell Adriel — Welcome to the State Machine Pattern](https://wendelladriel.com/blog/welcome-to-the-state-machine-pattern) | Blog técnico | 2025-08 |
