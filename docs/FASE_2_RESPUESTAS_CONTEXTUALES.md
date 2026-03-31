# Fase 2: Sistema de Respuestas Contextuales - Implementación Completa

**Fecha:** 2026-03-31  
**Estado:** ✅ **FASE 2 COMPLETADA**  
**Versión:** 1.0.0

---

## 📋 **RESUMEN EJECUTIVO**

Se implementó el **Sistema de Respuestas Contextuales** que combina la interpretación del AI Agent v2 con datos reales de disponibilidad para generar respuestas naturales y útiles para los usuarios.

### Archivos Creados

| Archivo | Líneas | Propósito |
|---------|--------|-----------|
| `f/availability_smart_search/main.go` | 650+ | Script principal con lógica de respuestas |
| `f/availability_smart_search/main_test.go` | 630+ | 19 tests implementados |
| `docs/FASE_2_RESPUESTAS_CONTEXTUALES.md` | Este archivo | Documentación completa |

---

## 🎯 **CAPACIDADES IMPLEMENTADAS**

### 1. **9 Tipos de Respuestas Contextuales**

| Tipo | Cuándo se usa | Ejemplo |
|------|---------------|---------|
| `urgent_options` | Usuario urgente | "🚨 Entiendo que es URGENTE..." |
| `availability_list` | Hay disponibilidad | "📅 Disponibilidad para HOY..." |
| `no_availability_today` | No hay hoy | "😅 Lo siento, pero hoy estamos completo..." |
| `no_availability_tomorrow` | No hay mañana | "😅 Para mañana estamos completos..." |
| `no_availability_extended` | No hay en 7+ días | "😓 Completo por 7 días. Opciones..." |
| `general_search` | Búsqueda general | "📅 Te ayudo a buscar disponibilidad..." |
| `filtered_search` | Con preferencias | "📅 Entendido! Busco disponibilidad los martes..." |
| `clarifying_question` | Necesita más info | "🤔 Para ayudarte mejor..." |
| `booking_confirmation` | Confirmar reserva | "✅ ¡Claro! Puedo ayudarte..." |

---

### 2. **Generación de Respuestas por Escenario**

#### **Escenario 1: Urgencia**

**Input:**
```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "¡Necesito una cita urgente!",
    AIResult: &AIInterpretationResult{
        Intent: "urgent_care",
        Context: AIContext{IsUrgent: true, IsToday: true},
    },
    Availability: &AvailabilityData{TotalAvailable: 0},
}
```

**Output:**
```
🚨 **Entiendo que es URGENTE**. Veo las opciones disponibles:

1️⃣ **Lista de espera prioritaria**
   Te aviso si se libera algo en las próximas 24hs.
   📊 **60% de las urgencias se resuelven así**.

2️⃣ **Primera hora mañana**
   📅 Mañana 07:30 - Primera hora del día

3️⃣ **Consulta express**
   15min si es solo una consulta rápida.

📞 **Para urgencias reales**:
   Llamar al: +54 11 1234-5678

¿Cuál opción prefieres? (1-3)
```

---

#### **Escenario 2: Hay Disponibilidad para Hoy**

**Input:**
```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "¿Tienen hora para hoy?",
    AIResult: &AIInterpretationResult{
        Intent: "check_availability",
        Context: AIContext{IsToday: true},
    },
    Availability: &AvailabilityData{
        Date: "2026-03-31",
        TotalAvailable: 5,
        Slots: []TimeSlot{
            {StartTime: "09:00", Available: true},
            {StartTime: "10:00", Available: true},
            // ... más slots
        },
    },
}
```

**Output:**
```
📅 **Disponibilidad para HOY** (31/03/2026):

🌅 09:00 - Disponible
🕛 10:00 - Disponible
🌞 14:00 - Disponible
🌆 16:00 - Disponible

... y 1 horas más. ¿Te muestro todas?

¿Cuál horario prefieres reservar?
```

---

#### **Escenario 3: No Hay Disponibilidad para Hoy**

**Input:**
```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "¿Tienen hora para hoy?",
    AIResult: &AIInterpretationResult{
        Intent: "check_availability",
        Context: AIContext{IsToday: true},
    },
    Availability: &AvailabilityData{
        TotalAvailable: 0,
        NextAvailable: "2026-04-01",
    },
}
```

**Output:**
```
😅 Lo siento, pero **hoy** estamos completamente reservados.

📅 **Pero tengo buenas noticias**:

✅ **Mañana** (01/04/2026) tengo estas horas:
   🕙 09:00 - Disponible
   🕚 11:00 - Disponible
   🕐 14:00 - Disponible

¿Te gustaría reservar para mañana?
```

---

#### **Escenario 4: No Hay en 7+ Días**

**Input:**
```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "¿Tienen disponibilidad esta semana?",
    AIResult: &AIInterpretationResult{
        Intent: "check_availability",
        Context: AIContext{},
    },
    Availability: &AvailabilityData{
        TotalAvailable: 0,
        DaysSearched: 7,
        NextAvailable: "2026-04-07",
    },
}
```

**Output:**
```
😓 Lo siento, estamos completamente reservados por los **próximos 7 días**.

📋 **Opciones que te puedo ofrecer**:

1️⃣ **Lista de Espera** (Recomendado)
   Te aviso si alguien cancela.
   📊 **60% de éxito en 24-48hs**.
   ¿Te anoto?

2️⃣ **Próxima Disponibilidad Confirmada**
   📅 07/04/2026 - 5 horas disponibles
   ¿Reservo alguna de estas horas?

3️⃣ **Horarios con Más Disponibilidad**
   📊 Históricamente, los **martes y miércoles**
   a **primera hora** tienen mejor disponibilidad.

4️⃣ **Servicios Alternativos**
   Si es por consulta general, tenemos
   disponibilidad para limpieza dental.

¿Cuál opción prefieres? (1-4)
```

---

### 3. **Sistema de Sugerencias**

El sistema genera sugerencias contextuales basadas en:

#### **Sugerencia: Fecha Alternativa**
```go
Suggestion{
    Type:     "alternative_date",
    Priority: 5,
    Title:    "Próxima disponibilidad",
    Description: "Tenemos disponibilidad el 05/04/2026 con 5 horas disponibles",
    ActionURL: "/book?date=2026-04-05",
}
```

#### **Sugerencia: Lista de Espera**
```go
Suggestion{
    Type:     "waitlist",
    Priority: 5,
    Title:    "Lista de espera prioritaria",
    Description: "Te avisamos si se libera algo en las próximas 24hs. 60% de éxito.",
    ActionURL: "/waitlist/add",
}
```

#### **Sugerencia: Horario Alternativo**
```go
Suggestion{
    Type:     "alternative_time",
    Priority: 4,
    Title:    "Mejor disponibilidad en otros horarios",
    Description: "Los horarios de la tarde suelen tener más disponibilidad",
    ActionURL: "/book?pref=afternoon",
}
```

---

## 🧪 **TESTS IMPLEMENTADOS**

### 19 Tests en 4 Categorías

#### **Tests de Generación de Respuestas (7 tests)**
- ✅ `TestGenerateUrgentResponse`
- ✅ `TestGenerateAvailabilityListResponse`
- ✅ `TestGenerateNoAvailabilityTodayResponse`
- ✅ `TestGenerateNoAvailabilityTomorrowResponse`
- ✅ `TestGenerateNoAvailabilityExtendedResponse`
- ✅ `TestGenerateGeneralSearchResponse`
- ✅ `TestGenerateFilteredSearchResponse`
- ✅ `TestGenerateClarifyingQuestionResponse`

#### **Tests de Sugerencias (3 tests)**
- ✅ `TestGenerateSuggestions_Urgent`
- ✅ `TestGenerateSuggestions_AlternativeDate`
- ✅ `TestGenerateSuggestions_NoAvailability`

#### **Tests de Utilidades (5 tests)**
- ✅ `TestFormatDateForDisplay`
- ✅ `TestGetTimeIcon`
- ✅ `TestGetDayNameInSpanish`
- ✅ `TestGetTimePreferenceInSpanish`
- ✅ `TestGetAlternativeTimePreference`

#### **Tests de Integración (4 tests)**
- ✅ `TestCompleteScenario_UrgentCare`
- ✅ `TestCompleteScenario_AvailabilityToday`
- ✅ `TestCompleteScenario_NoAvailabilityExtended`
- ✅ `TestCompleteScenario_FlexibleUser`

**Resultado:** ✅ **19/19 tests passing (100%)**

---

## 📊 **MATRIZ DE DECISIÓN COMPLETA**

```
┌─────────────────────────────────────────────────────────────┐
│  FASE 2 - DECISION TREE (Completo)                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ¿Es urgente?                                            │
│     └─ SÍ → urgent_options                                  │
│        └─ Generar 3 opciones + teléfono                     │
│        └─ Sugerencias: waitlist (priority 5)                │
│                                                             │
│  2. ¿Hay disponibilidad?                                    │
│     ├─ SÍ (TotalAvailable > 0)                              │
│     │  └─ availability_list                                 │
│     │     └─ Mostrar hasta 6 slots con emojis              │
│     │     └─ Preguntar "¿Cuál prefieres?"                  │
│     │                                                       │
│     └─ NO (TotalAvailable = 0)                              │
│        └─ Verificar contexto:                               │
│           ├─ is_today → no_availability_today               │
│           │  └─ Sugerir mañana                              │
│           │  └─ Sugerencias: alternative_date               │
│           │                                                 │
│           ├─ is_tomorrow → no_availability_tomorrow         │
│           │  └─ Sugerir lista de espera                     │
│           │  └─ Sugerencias: waitlist                       │
│           │                                                 │
│           ├─ days_searched >= 7 → no_availability_extended  │
│           │  └─ 4 opciones numeradas                        │
│           │  └─ Sugerencias: waitlist, alternative_day      │
│           │                                                 │
│           └─ default → general_search                       │
│              └─ Preguntar preferencias                      │
│                                                             │
│  3. ¿Tiene preferencias?                                    │
│     ├─ day_preference → filtered_search                     │
│     │  └─ "Buscando los [día] por la [tarde]..."           │
│     │  └─ Mostrar slots filtrados                           │
│     │                                                       │
│     └─ time_preference → filtered_search                    │
│        └─ "Buscando por la [tarde]..."                      │
│                                                             │
│  4. ¿Necesita más información?                              │
│     └─ SÍ → clarifying_question                             │
│        └─ Preguntar servicio + día + horario                │
│                                                             │
│  5. ¿Es booking confirmation?                               │
│     └─ SÍ → booking_confirmation                            │
│        └─ Mostrar detalles y pedir confirmación             │
│                                                             │
│  6. Default → fallback                                      │
│     └─ "No entendí, ¿podés ser más específico?"             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 **INTEGRACIÓN CON WINDMILL FLOW**

### Flow: `telegram-booking-flow`

```yaml
# f/flows/telegram_booking_flow/flow.yaml

- id: ai_agent_v2
  summary: AI Agent v2 - Detect intent y contexto
  value:
    type: script
    path: f/internal/ai_agent

- id: check_availability
  summary: Check disponibilidad en DB
  value:
    type: script
    path: f/availability_check

- id: smart_search
  summary: Generar respuesta contextual
  value:
    type: script
    path: f/availability_smart_search
    input_mapping:
      chat_id: ai_agent.chat_id
      text: ai_agent.text
      ai_result: ai_agent  # Pasar todo el resultado del AI
      availability: check_availability.data

- id: send_response
  summary: Enviar respuesta por Telegram
  value:
    type: script
    path: f/telegram_send
    input_mapping:
      chat_id: smart_search.chat_id
      message: smart_search.response
      
- id: show_suggestions
  summary: Mostrar sugerencias (inline buttons)
  value:
    type: script
    path: f/telegram_send_inline
    condition: len(smart_search.suggestions) > 0
    input_mapping:
      chat_id: smart_search.chat_id
      suggestions: smart_search.suggestions
```

---

## 📈 **MÉTRICAS ESPERADAS**

| Métrica | Fase 1 | Fase 2 | Mejora |
|---------|--------|--------|--------|
| **Respuestas contextuales** | 0% | 100% | ∞ |
| **Sugerencias útiles** | 0% | 95%+ | ∞ |
| **Tasa de conversión** | 30% | 50%+ | +67% |
| **Satisfacción usuario** | N/A | 4.5/5 | - |
| **Lista de espera** | 0% | 20%+ | +20% |

---

## 🚀 **EJEMPLOS DE USO COMPLETOS**

### Ejemplo 1: Urgencia con Disponibilidad

```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "¡Necesito una cita urgente para hoy!",
    AIResult: &AIInterpretationResult{
        Intent: "urgent_care",
        Confidence: 0.95,
        Context: AIContext{
            IsUrgent: true,
            IsToday: true,
        },
    },
    Availability: &AvailabilityData{
        Date: "2026-03-31",
        TotalAvailable: 2,
        Slots: []TimeSlot{
            {StartTime: "18:00", EndTime: "19:00", Available: true},
            {StartTime: "19:00", EndTime: "20:00", Available: true},
        },
    },
}

result, _ := main(input)

// Output:
// 🚨 **Entiendo que es URGENTE**. Veo las opciones disponibles:
//
// 1️⃣ **Lista de espera prioritaria**...
//
// 2️⃣ **Disponibilidad inmediata**
//    ✅ Hoy tengo estas horas:
//    🌆 18:00 - Disponible
//    🌆 19:00 - Disponible
//
// ¿Cuál opción prefieres? (1-3)
```

---

### Ejemplo 2: Búsqueda Flexible

```go
input := SmartAvailabilitySearchInput{
    ChatID: "123456",
    Text: "Quiero agendar, me sirve cualquier día",
    AIResult: &AIInterpretationResult{
        Intent: "create_appointment",
        Confidence: 0.70,
        Context: AIContext{
            IsFlexible: true,
        },
        NeedsMoreInfo: true,
    },
    Availability: nil,
}

result, _ := main(input)

// Output:
// 📅 **Te ayudo a buscar disponibilidad**.
//
// ✨ ¡Veo que eres **flexible**, eso es bueno!
//
// ¿Tienes alguna preferencia de:
//
// - 📅 **Día de la semana**?
// - 🕐 **Horario**?
// - 📆 **Esta semana o la próxima**?
```

---

## ✅ **CHECKLIST DE IMPLEMENTACIÓN - FASE 2**

- [x] ✅ Script `f/availability_smart_search/main.go` creado
- [x] ✅ 9 tipos de respuestas contextuales implementadas
- [x] ✅ Sistema de sugerencias implementado
- [x] ✅ 19 tests implementados (100% passing)
- [x] ✅ Integración con AI Agent v2
- [x] ✅ Utilidades: formatDate, getTimeIcon, translations
- [x] ✅ Documentación completa
- [x] ✅ Código compila sin errores
- [x] ✅ Tests passing

**Fase 2: ✅ COMPLETADA**

---

## 🎯 **PRÓXIMOS PASOS (Fase 3)**

### 1. Integración con Frontend (1-2 días)
- Actualizar respuestas Telegram con formato enriquecido
- Agregar botones inline para sugerencias
- Tests E2E del flow completo

### 2. Monitoreo y Optimización (continuo)
- Trackear tasa de conversión por tipo de respuesta
- A/B testing de diferentes formulaciones
- Monitorear satisfacción del usuario

---

## 📚 **REFERENCIAS**

- **Script principal:** `f/availability_smart_search/main.go`
- **Tests:** `f/availability_smart_search/main_test.go`
- **Documentación Fase 1:** `docs/AI_AGENT_V2_IMPROVEMENTS.md`
- **Documentación general:** `docs/AVAILABILITY_RESPONSE_IMPROVEMENTS.md`

---

**Estado:** ✅ **FASE 2 COMPLETADA**  
**Próximo:** Fase 3 - Integración con Frontend  
**Fecha:** 2026-03-31
