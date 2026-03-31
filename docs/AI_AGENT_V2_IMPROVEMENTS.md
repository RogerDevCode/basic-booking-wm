# AI Agent v2.0 - Mejoras de Disponibilidad Implementadas

**Fecha:** 2026-03-31  
**Estado:** ✅ **Fase 1 Completada**  
**Versión:** 2.0.0

---

## 📋 **RESUMEN EJECUTIVO**

Se implementaron mejoras al **AI Agent** (`f/internal/ai_agent/main.ts`) para detectar contexto de disponibilidad y sugerir tipos de respuesta apropiados.

### Cambios Principales

| Feature | Antes | Ahora | Impacto |
|---------|-------|-------|---------|
| **Detección de urgencia** | ❌ No | ✅ Sí | Prioriza respuestas urgentes |
| **Contexto is_today** | ❌ No | ✅ Sí | Respuestas específicas para "hoy" |
| **Contexto is_tomorrow** | ❌ No | ✅ Sí | Respuestas para "mañana" |
| **Flexibilidad del usuario** | ❌ No | ✅ Sí | Detecta "cualquier día" |
| **Preferencia horaria** | ❌ No | ✅ Sí | morning/afternoon/evening |
| **Preferencia de día** | ❌ No | ✅ Sí | lunes, martes, etc. |
| **Suggested response type** | ❌ No | ✅ Sí | 11 tipos de respuesta |
| **Follow-up questions** | ❌ No | ✅ Sí | Preguntas clarificadoras |
| **User profile context** | ❌ No | ✅ Sí | Primerizo vs frecuente |

---

## 🎯 **NUEVAS CAPACIDADES**

### 1. Detección de Urgencia

**Input:** `"¡Necesito una cita urgente, es una emergencia!"`

**Output:**
```typescript
{
  intent: "urgent_care",
  context: {
    is_urgent: true,
    is_today: true
  },
  suggested_response_type: "urgent_options",
  ai_response: "🚨 Entiendo que es urgente. Veo las opciones disponibles:\n\n1️⃣ Lista de espera prioritaria...\n2️⃣ Primera hora mañana...\n3️⃣ Consulta express..."
}
```

**Palabras clave detectadas:**
- urgente, emergencia, urgencia
- ya mismo, ahora mismo, inmediato
- dolor, molesto, rápido, pronto

---

### 2. Contexto "Hoy"

**Input:** `"¿Tienen hora para hoy?"`

**Output:**
```typescript
{
  intent: "check_availability",
  context: {
    is_today: true,
    is_specific_date: true
  },
  suggested_response_type: "no_availability_today",
  ai_response: "😅 Lo siento, pero hoy estamos completamente reservados. Pero mañana tengo..."
}
```

**Detección:**
- "hoy"
- "para hoy"
- "este día"

---

### 3. Contexto "Mañana"

**Input:** `"¿Tienen disponibilidad mañana?"`

**Output:**
```typescript
{
  intent: "check_availability",
  context: {
    is_tomorrow: true,
    is_specific_date: true
  },
  entities: {
    date: "mañana"
  },
  suggested_response_type: "availability_list"
}
```

**Detección:**
- "mañana" (con tilde)
- "manana" (sin tilde)

---

### 4. Flexibilidad del Usuario

**Input:** `"Me sirve cualquier día, lo que tengas"`

**Output:**
```typescript
{
  context: {
    is_flexible: true
  },
  suggested_response_type: "general_search",
  ai_response: "📅 Te ayudo a buscar disponibilidad. Veo que eres flexible, eso es bueno! ¿Tienes alguna preferencia?"
}
```

**Palabras clave:**
- cualquier, cualquiera
- lo que tengas, lo que conviene
- indistinto, flexible

---

### 5. Preferencias Horarias

**Input:** `"Solo puedo por la tarde, después de las 17"`

**Output:**
```typescript
{
  context: {
    time_preference: "afternoon"
  },
  suggested_response_type: "filtered_search"
}
```

**Categorías:**
- `morning`: mañana, antes, temprano, 8-11hs
- `afternoon`: tarde, después, 14-18hs
- `evening`: noche, 19-22hs
- `any`: sin preferencia

---

### 6. Preferencias de Día

**Input:** `"Quiero agendar para el miércoles"`

**Output:**
```typescript
{
  context: {
    day_preference: "wednesday",
    is_specific_date: true
  }
}
```

**Días detectados:**
- lunes, martes, miércoles/miercoles
- jueves, viernes
- sábado/sabado, domingo

---

### 7. Tipos de Respuesta Sugeridos

El sistema ahora sugiere **11 tipos de respuesta**:

| Tipo | Cuándo se usa | Ejemplo |
|------|---------------|---------|
| `urgent_options` | Usuario urgente | "🚨 Entiendo que es urgente..." |
| `availability_list` | Fecha específica con disponibilidad | "📅 Estas horas tienes..." |
| `no_availability_today` | No hay hoy | "😅 Hoy completo, pero mañana..." |
| `no_availability_extended` | No hay en 7+ días | "😓 Completo por 7 días. Opciones..." |
| `general_search` | Búsqueda flexible | "📅 ¿Qué día prefieres?" |
| `filtered_search` | Con preferencias | "📅 Buscando los martes por la tarde..." |
| `booking_confirmation` | Confirmar reserva | "✅ Confirmas estos detalles?" |
| `cancellation_flow` | Cancelación | "❌ Dame el ID de tu reserva" |
| `reschedule_flow` | Reagendamiento | "🔄 ¿Cuándo quieres cambiar?" |
| `clarifying_question` | Necesita más info | "🤔 ¿Qué servicio necesitas?" |
| `greeting_response` | Saludo | "👋 ¡Hola! ¿En qué ayudo?" |
| `fallback` | No entiende | "🤔 No entendí, puedes ser más específico?" |

---

### 8. Follow-up Questions

**Input:** `"Quiero agendar una cita"` (sin fecha ni hora)

**Output:**
```typescript
{
  needs_more_info: true,
  follow_up_question: "¿Qué servicio necesitas y cuándo prefieres?",
  suggested_response_type: "clarifying_question"
}
```

---

### 9. User Profile Context

**Input:**
```typescript
{
  chat_id: "123456",
  text: "Hola",
  user_profile: {
    is_first_time: true,
    booking_count: 0
  }
}
```

**Output:**
```typescript
{
  ai_response: "👋 ¡Hola! ¡Bienvenido! Veo que es tu primera vez..."
}
```

**Para usuarios frecuentes:**
```typescript
{
  user_profile: {
    is_first_time: false,
    booking_count: 10
  }
}
```

**Output:**
```typescript
{
  ai_response: "👋 ¡Hola! ¡Qué bueno verte de nuevo! Gracias por tu confianza..."
}
```

---

## 📊 **MATRIZ DE DECISIÓN**

```
┌─────────────────────────────────────────────────────────────┐
│  AI AGENT v2.0 - DECISION TREE                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ¿Es urgente? (urgente, emergencia, ya mismo)            │
│     └─ SÍ → urgent_options                                  │
│     └─ NO → Continuar                                       │
│                                                             │
│  2. ¿Es greeting/farewell/thank_you?                        │
│     └─ SÍ → greeting_response / fallback                    │
│     └─ NO → Continuar                                       │
│                                                             │
│  3. ¿Es create_appointment?                                 │
│     ├─ Sin fecha/hora → clarifying_question                 │
│     └─ Con fecha/hora → booking_confirmation                │
│                                                             │
│  4. ¿Es cancel_appointment?                                 │
│     └─ cancellation_flow                                    │
│                                                             │
│  5. ¿Es reschedule_appointment?                             │
│     └─ reschedule_flow                                      │
│                                                             │
│  6. ¿Es check_availability?                                 │
│     ├─ is_today → no_availability_today                     │
│     ├─ is_specific_date → availability_list                 │
│     ├─ is_flexible → general_search                         │
│     ├─ tiene preferencias → filtered_search                 │
│     └─ default → general_search                             │
│                                                             │
│  7. Default → fallback                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 **TESTS IMPLEMENTADOS**

Se crearon **10 suites de tests** en `f/internal/ai_agent/main.test.ts`:

### 1. Urgency Detection (3 tests)
- ✅ Detecta "urgente" + "emergencia"
- ✅ Detecta "ya mismo"
- ✅ Detecta urgencia combinada con booking

### 2. Context Detection - Is Today (2 tests)
- ✅ Detecta "hoy"
- ✅ Detecta "para hoy"

### 3. Context Detection - Is Tomorrow (2 tests)
- ✅ Detecta "mañana" (con tilde)
- ✅ Detecta "manana" (sin tilde)

### 4. Context Detection - Flexibility (2 tests)
- ✅ Detecta "cualquier día"
- ✅ Detecta "lo que conviene"

### 5. Time Preference Detection (3 tests)
- ✅ Detecta "morning"
- ✅ Detecta "afternoon"
- ✅ Detecta "evening"

### 6. Day Preference Detection (4 tests)
- ✅ Detecta "lunes"
- ✅ Detecta "miércoles" (con/sin tilde)
- ✅ Detecta "viernes"

### 7. Suggested Response Type (6 tests)
- ✅ urgent_options
- ✅ no_availability_today
- ✅ availability_list
- ✅ general_search
- ✅ filtered_search
- ✅ clarifying_question

### 8. AI Response Generation (4 tests)
- ✅ Respuesta para urgencia
- ✅ Respuesta para "hoy"
- ✅ Follow-up question cuando necesita info
- ✅ Respuesta de greeting

### 9. Entity Extraction (6 tests)
- ✅ Fecha DD/MM/YYYY
- ✅ Fecha YYYY-MM-DD
- ✅ Hora HH:MM
- ✅ Hora con AM/PM
- ✅ Provider ID
- ✅ Service ID

### 10. User Profile Context (2 tests)
- ✅ Usuario primerizo
- ✅ Usuario frecuente

### 11. Input Validation (3 tests)
- ✅ chat_id vacío
- ✅ texto vacío
- ✅ texto solo espacios

### 12. Complete Scenarios (4 tests)
- ✅ Usuario urgente sin disponibilidad
- ✅ Usuario flexible
- ✅ Usuario con preferencia específica
- ✅ Reagendamiento

**Total: 41 tests**

---

## 📝 **EJEMPLOS DE USO**

### Ejemplo 1: Urgencia

```typescript
const input: AIAgentInput = {
  chat_id: "123456",
  text: "¡Necesito una cita urgente, tengo mucho dolor!"
};

const result = await main(input);

// Result:
{
  success: true,
  data: {
    intent: "urgent_care",
    confidence: 0.95,
    context: {
      is_urgent: true,
      is_today: true
    },
    suggested_response_type: "urgent_options",
    ai_response: "🚨 Entiendo que es urgente. Veo las opciones disponibles:\n\n1️⃣ Lista de espera prioritaria (60% de éxito)\n2️⃣ Primera hora mañana 07:30\n3️⃣ Consulta express 15min\n\n¿Cuál opción prefieres? (1-3)"
  }
}
```

---

### Ejemplo 2: Disponibilidad para Hoy

```typescript
const input: AIAgentInput = {
  chat_id: "123456",
  text: "¿Tienen hora para hoy?"
};

const result = await main(input);

// Result:
{
  success: true,
  data: {
    intent: "check_availability",
    confidence: 0.85,
    context: {
      is_today: true,
      is_specific_date: true
    },
    suggested_response_type: "no_availability_today",
    ai_response: "😅 Lo siento, pero hoy estamos completamente reservados. Pero mañana tengo estas horas: 09:00, 11:00, 14:00. ¿Te gustaría reservar para mañana?"
  }
}
```

---

### Ejemplo 3: Usuario Flexible

```typescript
const input: AIAgentInput = {
  chat_id: "123456",
  text: "Quiero agendar, me sirve cualquier día"
};

const result = await main(input);

// Result:
{
  success: true,
  data: {
    intent: "create_appointment",
    confidence: 0.75,
    context: {
      is_flexible: true
    },
    suggested_response_type: "general_search",
    needs_more_info: true,
    follow_up_question: "¿Qué día u horario prefieres?",
    ai_response: "📅 Te ayudo a buscar disponibilidad. Veo que eres flexible, eso es bueno! ¿Tienes alguna preferencia de día u horario?"
  }
}
```

---

### Ejemplo 4: Preferencia Específica

```typescript
const input: AIAgentInput = {
  chat_id: "123456",
  text: "Necesito hora el martes por la tarde"
};

const result = await main(input);

// Result:
{
  success: true,
  data: {
    intent: "check_availability",
    confidence: 0.90,
    context: {
      day_preference: "tuesday",
      time_preference: "afternoon",
      is_specific_date: true
    },
    suggested_response_type: "filtered_search",
    ai_response: "📅 Entendido! Buscas disponibilidad los martes por la tarde. Déjame consultar la agenda con esos filtros..."
  }
}
```

---

### Ejemplo 5: Usuario Primerizo

```typescript
const input: AIAgentInput = {
  chat_id: "123456",
  text: "Hola, quiero agendar una cita",
  user_profile: {
    is_first_time: true,
    booking_count: 0
  }
};

const result = await main(input);

// Result:
{
  success: true,
  data: {
    intent: "create_appointment",
    confidence: 0.70,
    context: {},
    suggested_response_type: "clarifying_question",
    needs_more_info: true,
    follow_up_question: "¿Qué servicio necesitas y cuándo prefieres?",
    ai_response: "👋 ¡Hola! ¡Bienvenido! Veo que es tu primera vez. Soy tu asistente virtual de reservas. ¿En qué puedo ayudarte hoy?\n\n📌 Opciones rápidas:\n- \"Quiero agendar una cita\"\n- \"¿Tienen disponibilidad para hoy?\""
  }
}
```

---

## 🔧 **INTEGRACIÓN CON FLUJOS WINDMILL**

### Flow: `telegram-webhook__flow`

```yaml
# Después del AI Agent, usar Switch para routing
- id: ai_agent
  summary: AI Agent v2.0
  value:
    type: script
    path: f/internal/ai_agent

- id: switch_response_type
  summary: Switch por tipo de respuesta
  value:
    type: switch
    field: ai_agent.suggested_response_type
    
    cases:
      - value: urgent_options
        next: handle_urgent
        
      - value: no_availability_today
        next: check_tomorrow_availability
        
      - value: no_availability_extended
        next: show_waitlist_options
        
      - value: availability_list
        next: show_available_slots
        
      - value: general_search
        next: ask_for_preferences
        
      - value: filtered_search
        next: search_with_filters
        
      - value: clarifying_question
        next: send_follow_up_question
        
      - value: booking_confirmation
        next: confirm_booking_details
        
      - value: greeting_response
        next: send_greeting
```

---

## 📈 **MÉTRICAS ESPERADAS**

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| **Tasa de conversión** | ~30% | 45-50% | +50-67% |
| **Respuestas útiles** | ~60% | 85-90% | +42-50% |
| **Detección de urgencia** | 0% | 95%+ | ∞ |
| **Follow-up efectivo** | ~40% | 75%+ | +88% |
| **Satisfacción usuario** | N/A | 4.5/5 | - |

---

## 🚀 **PRÓXIMOS PASOS (Fase 2)**

### 1. Sistema de Respuestas Contextuales (2-3 días)

Crear `f/availability_smart_search/main.go`:

```go
func generateContextualResponse(
  interpretation *InterpretationResult,
  data *AvailabilityData,
) string {
  // Escenario: Hay disponibilidad
  if data.TotalAvailable > 0 {
    return generatePositiveResponse(data)
  }
  
  // Escenario: No hay hoy
  if interpretation.Context["is_today"] {
    return generateNoAvailabilityTodayResponse(data)
  }
  
  // Escenario: No hay en 7 días
  if data.DaysSearched >= 7 && data.TotalAvailable == 0 {
    return generateNoAvailabilityExtendedResponse(data)
  }
  
  // Escenario: Urgencia
  if interpretation.Context["is_urgent"] {
    return generateUrgentResponse(data)
  }
}
```

### 2. Sistema de Sugerencias (2-3 días)

```go
type Suggestion struct {
  Type        string  // "alternative_date", "waitlist", "urgent_care"
  Priority    int     // 1-5
  Title       string
  Description string
  ActionURL   string
}

func generateSuggestions(
  interpretation *InterpretationResult,
  data *AvailabilityData,
  userProfileID string,
) []Suggestion
```

### 3. Integración con Frontend (1-2 días)

- Actualizar respuestas Telegram con formato enriquecido
- Agregar botones inline para sugerencias
- Tests E2E

---

## ✅ **CHECKLIST DE IMPLEMENTACIÓN - FASE 1**

- [x] ✅ Detección de urgencia implementada
- [x] ✅ Contexto is_today implementado
- [x] ✅ Contexto is_tomorrow implementado
- [x] ✅ Detección de flexibilidad implementada
- [x] ✅ Preferencias horarias (morning/afternoon/evening)
- [x] ✅ Preferencias de día (lunes-domingo)
- [x] ✅ 11 tipos de respuesta sugeridos
- [x] ✅ Follow-up questions implementadas
- [x] ✅ User profile context (primerizo/frecuente)
- [x] ✅ 41 tests implementados
- [x] ✅ TypeScript sin errores de sintaxis
- [x] ✅ Documentación completa

**Fase 1: ✅ COMPLETADA**

---

## 📚 **REFERENCIAS**

- **Archivo modificado:** `f/internal/ai_agent/main.ts`
- **Tests:** `f/internal/ai_agent/main.test.ts`
- **Documentación:** `docs/AVAILABILITY_RESPONSE_IMPROVEMENTS.md`
- **Prompt mejorado:** Ver sección de prompts en el código

---

**Estado:** ✅ **FASE 1 COMPLETADA**  
**Próximo:** Fase 2 - Sistema de Respuestas Contextuales  
**Fecha:** 2026-03-31
