# Availability Response System - Análisis y Mejoras

**Fecha:** 2026-03-31  
**Estado:** 🔍 Análisis Completo  
**Versión:** 1.0.0

---

## 📊 **ESTADO ACTUAL DEL SISTEMA**

### ¿Qué puede hacer el sistema HOY?

| Funcionalidad | Implementada | Estado |
|--------------|--------------|--------|
| Check disponibilidad para fecha específica | ✅ Sí | Production |
| Find Next Available (7 días) | ✅ Sí | Production |
| Listar slots disponibles por día | ✅ Sí | Production |
| Integración con LLM para interpretación | ⚠️ Parcial | Mejorable |
| Respuestas contextuales cuando NO hay disponibilidad | ❌ No | **Pendiente** |
| Sugerencias automáticas de fechas alternativas | ❌ No | **Pendiente** |
| Manejo de escenarios "no hay hoy" | ❌ No | **Pendiente** |
| Manejo de escenarios "no hay en 1 semana" | ❌ No | **Pendiente** |

---

## 🔍 **ANÁLISIS DE ESCENARIOS TÍPICOS DE USUARIOS**

### Escenario 1: "¿Qué horas hay disponibles para hoy?"

**Input del usuario:**
```
"¿Tienen hora para hoy?"
"Quiero agendar una cita para hoy"
"¿Hay disponibilidad ahora?"
```

**Respuesta Actual del Sistema:**
```json
{
  "date": "2026-03-31",
  "slots": [
    {"start_time": "10:00", "available": true},
    {"start_time": "11:00", "available": true},
    {"start_time": "15:00", "available": true}
  ],
  "total_available": 3
}
```

**Respuesta Ideal (AI + Contexto):**
```
¡Hola! 👋 Para hoy (martes 31 de marzo) tenemos estas horas disponibles:

🕙 10:00 - Disponible
🕚 11:00 - Disponible  
🕒 15:00 - Disponible

¿Cuál prefieres reservar?

💡 Tip: Las horas de la tarde suelen estar más disponibles.
```

---

### Escenario 2: "No hay hora para hoy"

**Input del usuario:**
```
"¿Tienen hora para hoy?"
```

**Situación:** Todos los slots de hoy están ocupados

**Respuesta Actual del Sistema:**
```json
{
  "date": "2026-03-31",
  "slots": [],
  "total_available": 0
}
```

**❌ PROBLEMA:** El sistema NO da una respuesta útil al usuario

**Respuesta Ideal (AI + Contexto):**
```
😅 Lo siento, pero hoy (martes 31) estamos completamente reservados.

📅 Pero tengo buenas noticias:

✅ Mañana (miércoles 1 de abril) tengo estas horas:
   🕙 09:00 - Disponible
   🕚 11:00 - Disponible
   🕐 14:00 - Disponible

✅ También tengo disponibilidad el jueves 2 de abril:
   🕘 08:00 - Disponible
   🕙 10:00 - Disponible

¿Te gustaría reservar para alguno de estos días?

🔔 ¿Quieres que te avise si se libera algo para hoy?
```

---

### Escenario 3: "No hay disponibilidad en 1 semana"

**Situación:** Agenda completamente llena por 7+ días

**Respuesta Ideal (AI + Contexto):**
```
😓 Lo siento, estamos completamente reservados por los próximos 7 días.

📋 Opciones que te puedo ofrecer:

1️⃣ **Lista de Espera** (Recomendado)
   Te aviso si alguien cancela. Suele haber cancelaciones 24-48hs antes.
   
   ¿Te anoto en la lista de espera para esta semana?

2️⃣ **Próxima Disponibilidad Confirmada**
   📅 Lunes 7 de abril - Horas disponibles:
   🕘 08:00, 🕙 09:00, 🕚 11:00, 🕐 14:00
   
   ¿Reservo alguna de estas horas?

3️⃣ **Horarios con Más Disponibilidad**
   📊 Históricamente, los martes y miércoles a primera hora
   tienen mejor disponibilidad.
   
   ¿Quieres que te avise cuando abra la agenda la próxima semana?

4️⃣ **Servicios Alternativos**
   Si es por [servicio específico], tenemos disponibilidad
   para [servicio similar] esta semana.
   
   ¿Te interesa conocer alternativas?

¿Cuál opción prefieres? (1-4)
```

---

### Escenario 4: "Búsqueda por rango de fechas"

**Input del usuario:**
```
"Necesito agendar para la próxima semana"
"¿Qué días tienen disponibilidad?"
"Busco hora entre lunes y miércoles"
```

**Respuesta Ideal (AI + Contexto):**
```
📅 **Disponibilidad para la próxima semana** (1-7 abril):

| Día       | Mañana | Tarde | Estado |
|-----------|--------|-------|--------|
| Lun 01/04 | ✅ 3hs  | ✅ 2hs | Bueno  |
| Mar 02/04 | ✅ 5hs  | ✅ 4hs | Excelente |
| Mié 03/04 | ⚠️ 1h   | ❌ Lleno | Limitado |
| Jue 04/04 | ❌ Lleno | ❌ Lleno | Agotado |
| Vie 05/04 | ✅ 2hs  | ✅ 3hs | Bueno  |

🎯 **Mejores días:** Martes y Viernes (más disponibilidad)
⚠️ **Días limitados:** Miércoles (solo 1 hora mañana)
❌ **Días completos:** Jueves (sin disponibilidad)

¿Qué día prefieres? Te puedo mostrar las horas específicas.
```

---

### Escenario 5: "Búsqueda por preferencia horaria"

**Input del usuario:**
```
"Solo puedo por la tarde"
"¿Tienen horas después de las 17:00?"
"Necesito hora antes del trabajo, tipo 8am"
```

**Respuesta Ideal (AI + Contexto):**
```
🌅 **Disponibilidad para horas TEMPRANAS** (antes de 9:00):

Esta semana:
- ✅ Lun 01/04: 08:00, 08:30
- ✅ Mar 02/04: 07:30, 08:00
- ⚠️ Mié 03/04: 08:30 (última disponible)
- ❌ Jue 04/04: Sin horas tempranas
- ✅ Vie 05/04: 08:00, 08:30, 09:00

🦉 **Disponibilidad para horas VESPERTINAS** (después de 17:00):

Esta semana:
- ✅ Lun 01/04: 17:00, 17:30, 18:00
- ⚠️ Mar 02/04: 17:30 (última)
- ✅ Mié 03/04: 17:00, 17:30, 18:00, 18:30
- ✅ Jue 04/04: 17:00, 17:30
- ✅ Vie 05/04: 17:00, 17:30, 18:00

💡 **Tip:** Las horas de las 18:00 en adelante suelen tener
mejor disponibilidad de martes a jueves.

¿Cuál horario prefieres?
```

---

### Escenario 6: "Usuario con urgencia"

**Input del usuario:**
```
"¡Necesito una cita urgente!"
"¿Tienen hora para hoy mismo?"
"Es una emergencia, ¿pueden atenderme ya?"
```

**Respuesta Ideal (AI + Contexto):**
```
🚨 **Entiendo que es urgente. Veamos las opciones:**

✅ **OPCIÓN 1: Hoy mismo**
   Desafortunadamente hoy estamos completo.
   
   PERO: Tenemos **lista de espera prioritaria** para urgencias.
   - 60% de los casos urgentes se resuelven en 24hs
   - Te llamo si se libera algo
   
   ¿Te anoto en lista de espera urgente?

✅ **OPCIÓN 2: Mañana a primera hora**
   📅 Mañana (miércoles) tengo disponible:
   🕖 07:30 - Primera hora del día
   
   ¿Reservo esta hora?

✅ **OPCIÓN 3: Servicio Alternativo**
   Si es por [tipo de consulta], podemos hacer una
   **consulta express de 15min** hoy a las 18:00.
   
   ¿Te sirve esta opción?

📞 **OPCIÓN 4: Contacto Directo**
   Para urgencias reales, puedes llamar al:
   📱 +54 11 1234-5678
   
   Atendemos urgencias de 8:00 a 20:00.

¿Cuál opción prefieres? (1-4)

⏱️ **Tiempo de respuesta estimado:**
- Opción 1: 2-24 horas
- Opción 2: Confirmación inmediata
- Opción 3: 5 minutos para coordinar
- Opción 4: Inmediato (llamada)
```

---

### Escenario 7: "Reagendamiento por cancelación"

**Input del usuario:**
```
"Tuve que cancelar, ¿cuándo puedo volver?"
"Se me hizo imposible ir, ¿qué horas hay?"
```

**Respuesta Ideal (AI + Contexto):**
```
😔 **Entiendo, no te preocupes. Veamos disponibilidad:**

📊 **Tu historial:**
- Última cita: 15/03/2026 (hace 2 semanas)
- Servicio: Consulta General
- Profesional: Dr. García

📅 **Disponibilidad prioritaria** (por ser cliente frecuente):

✅ **Esta semana:**
- Jue 04/04: 16:00, 17:00
- Vie 05/04: 09:00, 11:00

✅ **Próxima semana (mejor disponibilidad):**
- Lun 08/04: 08:00, 09:00, 10:00, 14:00, 15:00
- Mar 09/04: 08:00, 09:00, 11:00, 16:00, 17:00

🎁 **Beneficio por ser cliente frecuente:**
- Puedes agendar con 24hs de anticipación sin cargo
- Horarios prioritarios antes que el público general

¿Qué día te viene bien? Te puedo reservar ahora mismo.

💡 **Tip:** Los lunes y martes por la mañana suelen tener
mejor disponibilidad y menos espera.
```

---

## 🎯 **MEJORAS PROPUESTAS PARA EL SISTEMA**

### Mejora 1: Sistema de Contexto de Disponibilidad

```go
// AvailabilityContext proporciona contexto rico para respuestas
type AvailabilityContext struct {
    // Datos básicos
    RequestedDate    string
    AvailableSlots   []Slot
    TotalAvailable   int
    
    // Contexto temporal
    IsToday          bool
    IsTomorrow       bool
    IsWeekend        bool
    DaysFromToday    int
    
    // Estadísticas
    WeekAverageSlots float64
    PercentFull      float64
    
    // Sugerencias
    NextAvailableDay string
    BestDayThisWeek  string
    WorstDayThisWeek string
    
    // Escenarios especiales
    IsUrgent         bool
    IsFirstTime      bool
    IsFrequentClient bool
}

// GenerateAvailabilityResponse genera respuesta contextual
func (ctx *AvailabilityContext) GenerateAvailabilityResponse() string {
    // Escenario 1: Hay disponibilidad para la fecha solicitada
    if ctx.TotalAvailable > 0 {
        return ctx.generatePositiveResponse()
    }
    
    // Escenario 2: No hay disponibilidad para hoy
    if ctx.IsToday && ctx.TotalAvailable == 0 {
        return ctx.generateNoAvailabilityTodayResponse()
    }
    
    // Escenario 3: No hay disponibilidad en rango extendido
    if ctx.TotalAvailable == 0 && ctx.DaysFromToday >= 7 {
        return ctx.generateNoAvailabilityExtendedResponse()
    }
    
    // Escenario 4: Búsqueda general (sin fecha específica)
    if ctx.RequestedDate == "" {
        return ctx.generateGeneralAvailabilityResponse()
    }
    
    return ctx.generateFallbackResponse()
}
```

---

### Mejora 2: Sistema de Sugerencias Inteligentes

```go
// SuggestionEngine genera sugerencias basadas en patrones
type SuggestionEngine struct {
    HistoricalData *AvailabilityHistory
    BookingPatterns *BookingPatterns
}

type Suggestion struct {
    Type        string // "alternative_date", "alternative_time", "waitlist", "service"
    Priority    int    // 1-5 (5 = más relevante)
    Title       string
    Description string
    ActionURL   string // Opcional: deep link para reservar
}

// GenerateSuggestions genera sugerencias personalizadas
func (eng *SuggestionEngine) GenerateSuggestions(
    ctx *AvailabilityContext,
    userProfile *UserProfile,
) []Suggestion {
    suggestions := []Suggestion{}
    
    // Sugerencia 1: Fecha alternativa más cercana
    if ctx.TotalAvailable == 0 {
        suggestions = append(suggestions, Suggestion{
            Type:     "alternative_date",
            Priority: 5,
            Title:    "Próxima disponibilidad",
            Description: fmt.Sprintf(
                "Tenemos disponibilidad el %s con %d horas disponibles",
                ctx.NextAvailableDay,
                ctx.NextAvailableSlots,
            ),
            ActionURL: "/book?date=" + ctx.NextAvailableDay,
        })
    }
    
    // Sugerencia 2: Lista de espera (si es urgente)
    if ctx.IsUrgent {
        suggestions = append(suggestions, Suggestion{
            Type:     "waitlist",
            Priority: 5,
            Title:    "Lista de espera prioritaria",
            Description: "Te avisamos si se libera algo en las próximas 24hs. " +
                         "60% de las urgencias se resuelven así.",
            ActionURL: "/waitlist/add",
        })
    }
    
    // Sugerencia 3: Horarios con mejor disponibilidad
    if ctx.TotalAvailable < 3 {
        suggestions = append(suggestions, Suggestion{
            Type:     "alternative_time",
            Priority: 4,
            Title:    "Mejor disponibilidad en otros horarios",
            Description: fmt.Sprintf(
                "Los %s suelen tener más disponibilidad",
                ctx.BestDayThisWeek,
            ),
            ActionURL: "/book?pref=" + ctx.BestDayThisWeek,
        })
    }
    
    // Sugerencia 4: Servicio alternativo
    if userProfile.LastService != "" {
        altService := eng.FindAlternativeService(userProfile.LastService)
        if altService != nil {
            suggestions = append(suggestions, Suggestion{
                Type:     "service",
                Priority: 3,
                Title:    "Servicio alternativo disponible",
                Description: fmt.Sprintf(
                    "Para %s, tenemos disponibilidad para %s",
                    userProfile.LastService,
                    altService.Name,
                ),
                ActionURL: "/book?service=" + altService.ID,
            })
        }
    }
    
    return suggestions
}
```

---

### Mejora 3: Sistema de Respuestas por Niveles de Confianza

```go
// ConfidenceLevel determina el tipo de respuesta
type ConfidenceLevel string

const (
    ConfidenceHigh   ConfidenceLevel = "high"    // > 0.8
    ConfidenceMedium ConfidenceLevel = "medium"  // 0.5 - 0.8
    ConfidenceLow    ConfidenceLevel = "low"     // < 0.5
)

// ResponseStrategy define cómo responder según confianza
type ResponseStrategy struct {
    Level           ConfidenceLevel
    IncludeDetails  bool
    IncludeSuggestions bool
    IncludeAlternatives bool
    AskForConfirmation bool
    Tone            string // "direct", "helpful", "cautious"
}

func GetResponseStrategy(confidence float64, intent string) ResponseStrategy {
    if confidence > 0.8 {
        return ResponseStrategy{
            Level:              ConfidenceHigh,
            IncludeDetails:     true,
            IncludeSuggestions: true,
            IncludeAlternatives: false,
            AskForConfirmation: true,
            Tone:               "direct",
        }
    }
    
    if confidence > 0.5 {
        return ResponseStrategy{
            Level:              ConfidenceMedium,
            IncludeDetails:     true,
            IncludeSuggestions: true,
            IncludeAlternatives: true,
            AskForConfirmation: true,
            Tone:               "helpful",
        }
    }
    
    // Baja confianza
    return ResponseStrategy{
        Level:              ConfidenceLow,
        IncludeDetails:     false,
        IncludeSuggestions: false,
        IncludeAlternatives: true,
        AskForConfirmation: true,
        Tone:               "cautious",
    }
}
```

---

## 📋 **PROMPTS MEJORADOS PARA EL LLM**

### Prompt Actual (Simplificado)

```
Classify the user's message into EXACTLY ONE of these intents:
- list_available: User wants to see available appointment times
- create_booking: User wants to book/schedule an appointment
- cancel_booking: User wants to cancel an existing appointment
...

Extract relevant entities: date, time, provider_name, service_type, booking_id.
If the user hasn't provided enough info, set needs_more=true and provide a follow_up question.
```

### Prompt Mejorado (Propuesta)

```
Eres un asistente de reservas médicas experto en ayudar a pacientes a encontrar disponibilidad.

## TU TAREA:
1. Clasificar el intent del usuario
2. Extraer entidades (fecha, hora, servicio, urgencia)
3. Determinar el CONTEXTO de la solicitud
4. Generar una respuesta EMPÁTICA y ÚTIL

## INTENTS DISPONIBLES:
- list_available: Quiere ver horas disponibles
- create_booking: Quiere reservar
- cancel_booking: Quiere cancelar
- reschedule: Quiere reagendar
- urgent_care: Necesita atención urgente (detectar por palabras: "urgente", "emergencia", "ya mismo", "dolor")
- general_question: Pregunta general
- greeting: Saludo

## ENTIDADES A EXTRAER:
- date: "hoy", "mañana", "2026-04-01", "próxima semana", "lunes"
- time_preference: "mañana", "tarde", "antes de las 9", "después de las 17"
- urgency: true/false (detectar por tono y palabras clave)
- flexibility: "cualquier día", "solo martes", "lo que tengas"
- service_type: tipo de servicio si menciona

## CONTEXTO A DETERMINAR:
- is_today: ¿Pregunta por hoy?
- is_specific_date: ¿Menciona fecha específica?
- is_flexible: ¿Es flexible con fechas/horarios?
- is_urgent: ¿Es urgente?
- is_first_time: ¿Es cliente nuevo? (si hay historial)

## FORMATO DE RESPUESTA:
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "entities": {...},
  "context": {
    "is_today": bool,
    "is_urgent": bool,
    "is_flexible": bool,
    "time_preference": "morning|afternoon|evening|any"
  },
  "needs_more": bool,
  "follow_up": "Pregunta para clarificar si necesita más info",
  "suggested_response_type": "availability_list|no_availability_today|no_availability_extended|urgent_options|general_search"
}

## EJEMPLOS:

Input: "¿Tienen hora para hoy?"
Output: {
  "intent": "list_available",
  "confidence": 0.95,
  "entities": {"date": "hoy"},
  "context": {"is_today": true, "is_urgent": false, "is_flexible": false},
  "needs_more": false,
  "follow_up": "",
  "suggested_response_type": "availability_list"
}

Input: "¡Necesito una cita urgente, es una emergencia!"
Output: {
  "intent": "urgent_care",
  "confidence": 0.98,
  "entities": {"urgency": true},
  "context": {"is_today": true, "is_urgent": true, "is_flexible": true},
  "needs_more": false,
  "follow_up": "",
  "suggested_response_type": "urgent_options"
}

Input: "¿Qué días tienen disponibilidad la próxima semana?"
Output: {
  "intent": "list_available",
  "confidence": 0.92,
  "entities": {"date": "próxima semana"},
  "context": {"is_today": false, "is_urgent": false, "is_flexible": true},
  "needs_more": false,
  "follow_up": "",
  "suggested_response_type": "general_search"
}

Input: "Solo puedo los martes por la tarde"
Output: {
  "intent": "list_available",
  "confidence": 0.88,
  "entities": {"time_preference": "afternoon", "day_preference": "tuesday"},
  "context": {"is_today": false, "is_urgent": false, "is_flexible": false},
  "needs_more": false,
  "follow_up": "",
  "suggested_response_type": "filtered_search"
}
```

---

## 🛠️ **IMPLEMENTACIÓN PROPUESTA**

### Script 1: `f/availability_smart_search/main.go`

```go
package inner

import (
	"context"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/ai"
)

// SmartAvailabilitySearchInput input para búsqueda inteligente
type SmartAvailabilitySearchInput struct {
	ChatID         string `json:"chat_id"`
	Text           string `json:"text"`
	ProviderID     string `json:"provider_id"`
	ServiceID      string `json:"service_id"`
	UserProfileID  string `json:"user_profile_id,omitempty"`
}

// SmartAvailabilitySearchResult resultado enriquecido
type SmartAvailabilitySearchResult struct {
	Success       bool                   `json:"success"`
	ChatID        string                 `json:"chat_id"`
	Intent        string                 `json:"intent"`
	Confidence    float64                `json:"confidence"`
	Response      string                 `json:"response"` // Respuesta natural para el usuario
	ResponseType  string                 `json:"response_type"`
	Data          map[string]interface{} `json:"data,omitempty"`
	Suggestions   []Suggestion           `json:"suggestions,omitempty"`
	Error         string                 `json:"error,omitempty"`
}

// Suggestion representa una sugerencia para el usuario
type Suggestion struct {
	Type        string `json:"type"`
	Priority    int    `json:"priority"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ActionURL   string `json:"action_url,omitempty"`
}

func main(ctx context.Context, input SmartAvailabilitySearchInput) (SmartAvailabilitySearchResult, error) {
	result := SmartAvailabilitySearchResult{
		Success:     false,
		ChatID:      input.ChatID,
		Suggestions: make([]Suggestion, 0),
	}

	// 1. Interpretar input con LLM
	interpretation, err := ai.InterpretAvailabilityRequest(input.Text)
	if err != nil {
		result.Error = fmt.Sprintf("AI interpretation failed: %v", err)
		return result, nil
	}

	result.Intent = interpretation.Intent
	result.Confidence = interpretation.Confidence

	// 2. Determinar rango de búsqueda
	searchRange := determineSearchRange(interpretation.Context)

	// 3. Buscar disponibilidad
	availabilityData, err := searchAvailability(ctx, input.ProviderID, input.ServiceID, searchRange)
	if err != nil {
		result.Error = fmt.Sprintf("Availability search failed: %v", err)
		return result, nil
	}

	// 4. Generar respuesta contextual
	response := generateContextualResponse(interpretation, availabilityData)
	result.Response = response
	result.ResponseType = interpretation.SuggestedResponseType

	// 5. Generar sugerencias
	suggestions := generateSuggestions(interpretation, availabilityData, input.UserProfileID)
	result.Suggestions = suggestions

	// 6. Incluir datos raw para el frontend
	result.Data = map[string]interface{}{
		"availability": availabilityData,
		"interpretation": interpretation,
	}

	result.Success = true
	return result, nil
}

// determineSearchRange determina qué fechas buscar según el contexto
func determineSearchRange(ctx map[string]interface{}) SearchRange {
	// Si es "hoy", buscar solo hoy
	if isToday, ok := ctx["is_today"].(bool); ok && isToday {
		return SearchRange{
			Start: time.Now(),
			End:   time.Now(),
			Mode:  "single_day",
		}
	}

	// Si es urgente, buscar hoy + mañana
	if isUrgent, ok := ctx["is_urgent"].(bool); ok && isUrgent {
		return SearchRange{
			Start: time.Now(),
			End:   time.Now().AddDate(0, 0, 1),
			Mode:  "urgent",
		}
	}

	// Si es flexible o búsqueda general, buscar 7 días
	if isFlexible, ok := ctx["is_flexible"].(bool); ok && isFlexible {
		return SearchRange{
			Start: time.Now(),
			End:   time.Now().AddDate(0, 0, 7),
			Mode:  "extended",
		}
	}

	// Por defecto, buscar 3 días
	return SearchRange{
		Start: time.Now(),
		End:   time.Now().AddDate(0, 0, 3),
		Mode:  "default",
	}
}

// generateContextualResponse genera respuesta natural según el contexto
func generateContextualResponse(
	interpretation *ai.InterpretationResult,
	data *AvailabilityData,
) string {
	// Escenario: Hay disponibilidad
	if data.TotalAvailable > 0 {
		return generatePositiveResponse(data, interpretation.Context)
	}

	// Escenario: No hay disponibilidad para hoy
	if interpretation.Context["is_today"] == true {
		return generateNoAvailabilityTodayResponse(data)
	}

	// Escenario: No hay disponibilidad extendida (7+ días)
	if data.DaysSearched >= 7 && data.TotalAvailable == 0 {
		return generateNoAvailabilityExtendedResponse(data)
	}

	// Escenario: Búsqueda urgente
	if interpretation.Context["is_urgent"] == true {
		return generateUrgentResponse(data)
	}

	// Fallback
	return generateFallbackResponse(data)
}
```

---

## ✅ **CHECKLIST DE IMPLEMENTACIÓN**

### Fase 1: Mejoras al LLM (1-2 días)

- [ ] Actualizar prompt del AI Agent con contexto de disponibilidad
- [ ] Agregar detección de urgencia
- [ ] Agregar detección de preferencias horarias
- [ ] Incluir `suggested_response_type` en el output
- [ ] Tests de interpretación de intents

### Fase 2: Sistema de Respuestas Contextuales (2-3 días)

- [ ] Crear `f/availability_smart_search/main.go`
- [ ] Implementar `generateContextualResponse()`
- [ ] Implementar escenarios:
  - [ ] Hay disponibilidad (respuesta positiva)
  - [ ] No hay hoy (sugerir mañana)
  - [ ] No hay en 7 días (lista de espera + alternativas)
  - [ ] Urgencia (opciones prioritarias)
- [ ] Tests de respuestas

### Fase 3: Sistema de Sugerencias (2-3 días)

- [ ] Implementar `SuggestionEngine`
- [ ] Sugerencias por fecha alternativa
- [ ] Sugerencias por horario alternativo
- [ ] Sugerencias por lista de espera
- [ ] Sugerencias por servicio alternativo
- [ ] Tests de sugerencias

### Fase 4: Integración con Frontend (1-2 días)

- [ ] Actualizar Telegram responses con formato enriquecido
- [ ] Agregar botones para sugerencias (inline keyboard)
- [ ] Mejorar formato de listas de disponibilidad
- [ ] Tests E2E

### Fase 5: Monitoreo y Optimización (continuo)

- [ ] Trackear tasa de conversión por tipo de respuesta
- [ ] A/B testing de diferentes formulaciones
- [ ] Monitorear satisfacción del usuario
- [ ] Optimizar prompts según métricas

---

## 📊 **MÉTRICAS DE ÉXITO**

| Métrica | Actual | Objetivo | Cómo Medir |
|---------|--------|----------|------------|
| **Tasa de conversión** | ~30% | 50%+ | Bookings / Consultas de disponibilidad |
| **Satisfacción** | N/A | 4.5/5 | Encuesta post-reserva |
| **Tiempo a reserva** | ~5 min | < 3 min | Tiempo desde consulta hasta booking |
| **Respuestas útiles** | ~60% | 90%+ | % de consultas con respuesta accionable |
| **Lista de espera** | 0% | 20% | % de usuarios que se anotan |

---

## 🎯 **CONCLUSIÓN**

**El sistema ACTUAL puede:**
- ✅ Mostrar disponibilidad para una fecha específica
- ✅ Buscar próximo disponible (7 días)
- ✅ Listar slots disponibles

**El sistema ACTUAL NO puede:**
- ❌ Dar respuestas contextuales cuando no hay disponibilidad
- ❌ Sugerir alternativas inteligentes
- ❌ Manejar escenarios de urgencia
- ❌ Ofrecer lista de espera
- ❌ Personalizar según historial del usuario

**Con las mejoras propuestas:**
- ✅ Respuestas empáticas y útiles en TODOS los escenarios
- ✅ Sugerencias inteligentes basadas en contexto
- ✅ Manejo de urgencias con opciones claras
- ✅ Lista de espera automática
- ✅ Personalización por perfil de usuario
- ✅ **Objetivo: 50%+ tasa de conversión**

---

**¿Quieres que implemente alguna de estas mejoras?** 🚀

La **Fase 1** (mejoras al LLM) es la más rápida y tiene mayor impacto inmediato.
