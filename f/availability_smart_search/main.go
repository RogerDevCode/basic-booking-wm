package inner

import (
	"fmt"
	"strings"
	"time"
)

// ============================================================================
// TIPOS DE DATOS
// ============================================================================

// SmartAvailabilitySearchInput input para búsqueda inteligente de disponibilidad
type SmartAvailabilitySearchInput struct {
	ChatID        string                 `json:"chat_id"`
	Text          string                 `json:"text"`
	ProviderID    string                 `json:"provider_id"`
	ServiceID     string                 `json:"service_id"`
	UserProfileID string                 `json:"user_profile_id,omitempty"`
	AIResult      *AIInterpretationResult `json:"ai_result,omitempty"` // Resultado del AI Agent v2
	Availability  *AvailabilityData       `json:"availability,omitempty"` // Datos de disponibilidad (de DB)
}

// AIInterpretationResult representa el resultado del AI Agent v2
type AIInterpretationResult struct {
	Intent              string            `json:"intent"`
	Confidence          float64           `json:"confidence"`
	Context             AIContext         `json:"context"`
	SuggestedResponseType string          `json:"suggested_response_type"`
	NeedsMoreInfo       bool              `json:"needs_more_info"`
	FollowUpQuestion    string            `json:"follow_up_question"`
	Entities            map[string]string `json:"entities"`
}

// AIContext representa el contexto de disponibilidad del AI Agent
type AIContext struct {
	IsToday        bool   `json:"is_today"`
	IsTomorrow     bool   `json:"is_tomorrow"`
	IsUrgent       bool   `json:"is_urgent"`
	IsFlexible     bool   `json:"is_flexible"`
	IsSpecificDate bool   `json:"is_specific_date"`
	TimePreference string `json:"time_preference"` // morning, afternoon, evening, any
	DayPreference  string `json:"day_preference"`  // monday, tuesday, etc.
}

// AvailabilityData representa los datos de disponibilidad de la DB
type AvailabilityData struct {
	Date           string     `json:"date"`
	Slots          []TimeSlot `json:"slots"`
	TotalAvailable int        `json:"total_available"`
	DaysSearched   int        `json:"days_searched"`
	NextAvailable  string     `json:"next_available,omitempty"`
	WeekAverage    float64    `json:"week_average,omitempty"`
}

// TimeSlot representa un slot de tiempo disponible
type TimeSlot struct {
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Available bool   `json:"available"`
}

// Suggestion representa una sugerencia para el usuario
type Suggestion struct {
	Type        string `json:"type"`         // alternative_date, waitlist, urgent_care, service_alternative
	Priority    int    `json:"priority"`     // 1-5 (5 = más relevante)
	Title       string `json:"title"`
	Description string `json:"description"`
	ActionURL   string `json:"action_url,omitempty"`
}

// SmartAvailabilitySearchResult resultado enriquecido con contexto
type SmartAvailabilitySearchResult struct {
	Success       bool        `json:"success"`
	ChatID        string      `json:"chat_id"`
	Intent        string      `json:"intent"`
	Confidence    float64     `json:"confidence"`
	Response      string      `json:"response"` // Respuesta natural para el usuario
	ResponseType  string      `json:"response_type"`
	Data          interface{} `json:"data,omitempty"`
	Suggestions   []Suggestion `json:"suggestions,omitempty"`
	NeedsMoreInfo bool        `json:"needs_more_info,omitempty"`
	FollowUp      string      `json:"follow_up,omitempty"`
	Error         string      `json:"error,omitempty"`
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

// main ejecuta la búsqueda inteligente de disponibilidad
// Combina interpretación del AI Agent v2 con datos reales de disponibilidad
func main(input SmartAvailabilitySearchInput) (SmartAvailabilitySearchResult, error) {
	result := SmartAvailabilitySearchResult{
		Success:     false,
		ChatID:      input.ChatID,
		Suggestions: make([]Suggestion, 0),
	}

	// Validar input básico
	if input.ChatID == "" || input.Text == "" {
		result.Error = "validation: chat_id and text are required"
		return result, nil
	}

	// Si no hay AIResult, usar interpretación básica
	if input.AIResult == nil {
		input.AIResult = createBasicInterpretation(input.Text)
	}

	result.Intent = input.AIResult.Intent
	result.Confidence = input.AIResult.Confidence
	result.NeedsMoreInfo = input.AIResult.NeedsMoreInfo
	result.FollowUp = input.AIResult.FollowUpQuestion

	// Determinar tipo de respuesta basado en contexto + disponibilidad
	responseType := determineResponseType(input.AIResult, input.Availability)
	result.ResponseType = responseType

	// Generar respuesta contextual
	response := generateContextualResponse(input.AIResult, input.Availability)
	result.Response = response

	// Generar sugerencias
	suggestions := generateSuggestions(input.AIResult, input.Availability)
	result.Suggestions = suggestions

	// Incluir datos raw
	result.Data = map[string]interface{}{
		"availability": input.Availability,
		"ai_context":   input.AIResult.Context,
	}

	result.Success = true
	return result, nil
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// createBasicInterpretation crea una interpretación básica si no hay AIResult
func createBasicInterpretation(text string) *AIInterpretationResult {
	textLower := strings.ToLower(text)
	
	result := &AIInterpretationResult{
		Intent:     "unknown",
		Confidence: 0.5,
		Context: AIContext{
			TimePreference: "any",
		},
		Entities: make(map[string]string),
	}

	// Detectar intentos básicos
	if strings.Contains(textLower, "urgente") || strings.Contains(textLower, "emergencia") {
		result.Intent = "urgent_care"
		result.Context.IsUrgent = true
		result.Confidence = 0.9
	} else if strings.Contains(textLower, "hoy") {
		result.Intent = "check_availability"
		result.Context.IsToday = true
		result.Context.IsSpecificDate = true
		result.Confidence = 0.85
	} else if strings.Contains(textLower, "mañana") || strings.Contains(textLower, "manana") {
		result.Intent = "check_availability"
		result.Context.IsTomorrow = true
		result.Context.IsSpecificDate = true
		result.Confidence = 0.85
	} else if strings.Contains(textLower, "cualquier") || strings.Contains(textLower, "flexible") {
		result.Intent = "check_availability"
		result.Context.IsFlexible = true
		result.Confidence = 0.75
	} else if strings.Contains(textLower, "disponibilidad") || strings.Contains(textLower, "disponible") {
		result.Intent = "check_availability"
		result.Confidence = 0.8
	} else if strings.Contains(textLower, "agendar") || strings.Contains(textLower, "reservar") {
		result.Intent = "create_appointment"
		result.Confidence = 0.8
	}

	return result
}

// determineResponseType determina el tipo de respuesta basado en contexto y disponibilidad
func determineResponseType(ai *AIInterpretationResult, avail *AvailabilityData) string {
	// 1. Urgencia primero
	if ai.Context.IsUrgent || ai.Intent == "urgent_care" {
		return "urgent_options"
	}

	// 2. Si hay datos de disponibilidad
	if avail != nil {
		// Hay disponibilidad
		if avail.TotalAvailable > 0 {
			return "availability_list"
		}

		// No hay disponibilidad
		if ai.Context.IsToday {
			return "no_availability_today"
		}

		if avail.DaysSearched >= 7 {
			return "no_availability_extended"
		}

		if ai.Context.IsTomorrow {
			return "no_availability_tomorrow"
		}
	}

	// 3. Basado en el contexto del AI
	if ai.Context.IsToday {
		return "no_availability_today" // Asumir peor caso, el sistema ajustará
	}

	if ai.Context.IsSpecificDate {
		return "availability_list"
	}

	if ai.Context.IsFlexible {
		return "general_search"
	}

	if ai.Context.DayPreference != "" || ai.Context.TimePreference != "any" {
		return "filtered_search"
	}

	if ai.NeedsMoreInfo {
		return "clarifying_question"
	}

	return "general_search"
}

// generateContextualResponse genera la respuesta natural para el usuario
func generateContextualResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	responseType := determineResponseType(ai, avail)

	switch responseType {
	case "urgent_options":
		return generateUrgentResponse(ai, avail)

	case "availability_list":
		return generateAvailabilityListResponse(ai, avail)

	case "no_availability_today":
		return generateNoAvailabilityTodayResponse(ai, avail)

	case "no_availability_tomorrow":
		return generateNoAvailabilityTomorrowResponse(ai, avail)

	case "no_availability_extended":
		return generateNoAvailabilityExtendedResponse(ai, avail)

	case "general_search":
		return generateGeneralSearchResponse(ai, avail)

	case "filtered_search":
		return generateFilteredSearchResponse(ai, avail)

	case "clarifying_question":
		return generateClarifyingQuestionResponse(ai, avail)

	case "booking_confirmation":
		return generateBookingConfirmationResponse(ai, avail)

	default:
		return generateFallbackResponse(ai, avail)
	}
}

// ============================================================================
// GENERADORES DE RESPUESTAS POR ESCENARIO
// ============================================================================

// generateUrgentResponse genera respuesta para urgencias
func generateUrgentResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("🚨 **Entiendo que es URGENTE**. Veo las opciones disponibles:\n\n")

	sb.WriteString("1️⃣ **Lista de espera prioritaria**\n")
	sb.WriteString("   Te aviso si se libera algo en las próximas 24hs.\n")
	sb.WriteString("   📊 **60% de las urgencias se resuelven así**.\n\n")

	// Si hay disponibilidad para hoy/mañana
	if avail != nil && avail.TotalAvailable > 0 {
		sb.WriteString("2️⃣ **Disponibilidad inmediata**\n")
		if ai.Context.IsToday {
			sb.WriteString(fmt.Sprintf("   ✅ Hoy tengo estas horas:\n"))
		} else {
			sb.WriteString(fmt.Sprintf("   ✅ Mañana tengo estas horas:\n"))
		}
		for i, slot := range avail.Slots {
			if i < 3 { // Mostrar máximo 3 slots
				sb.WriteString(fmt.Sprintf("   🕐 %s - Disponible\n", slot.StartTime))
			}
		}
		sb.WriteString("\n")
	} else {
		sb.WriteString("2️⃣ **Primera hora mañana**\n")
		sb.WriteString("   📅 Mañana 07:30 - Primera hora del día\n\n")
	}

	sb.WriteString("3️⃣ **Consulta express**\n")
	sb.WriteString("   15min si es solo una consulta rápida.\n\n")

	sb.WriteString("📞 **Para urgencias reales**:\n")
	sb.WriteString("   Llamar al: +54 11 1234-5678\n")
	sb.WriteString("   Atendemos urgencias de 8:00 a 20:00.\n\n")

	sb.WriteString("¿Cuál opción prefieres? (1-3)")

	return sb.String()
}

// generateAvailabilityListResponse genera respuesta cuando hay disponibilidad
func generateAvailabilityListResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	if avail == nil || avail.TotalAvailable == 0 {
		return "📅 Déjame verificar la disponibilidad...\n\n✨ Un momento, estoy consultando la agenda..."
	}

	// Encabezado
	if ai.Context.IsToday {
		sb.WriteString(fmt.Sprintf("📅 **Disponibilidad para HOY** (%s):\n\n", formatDateForDisplay(avail.Date)))
	} else if ai.Context.IsTomorrow {
		sb.WriteString(fmt.Sprintf("📅 **Disponibilidad para MAÑANA** (%s):\n\n", formatDateForDisplay(avail.Date)))
	} else if avail.Date != "" {
		sb.WriteString(fmt.Sprintf("📅 **Disponibilidad para %s**:\n\n", formatDateForDisplay(avail.Date)))
	} else {
		sb.WriteString("📅 **Horarios disponibles**:\n\n")
	}

	// Mostrar slots (máximo 6 para no saturar)
	maxSlots := 6
	if len(avail.Slots) < maxSlots {
		maxSlots = len(avail.Slots)
	}

	for i := 0; i < maxSlots; i++ {
		slot := avail.Slots[i]
		timeIcon := getTimeIcon(slot.StartTime)
		sb.WriteString(fmt.Sprintf("%s %s - Disponible\n", timeIcon, slot.StartTime))
	}

	if len(avail.Slots) > 6 {
		remaining := len(avail.Slots) - 6
		sb.WriteString(fmt.Sprintf("\n... y %d horas más. ¿Te muestro todas?", remaining))
	}

	sb.WriteString("\n\n¿Cuál horario prefieres reservar?")

	return sb.String()
}

// generateNoAvailabilityTodayResponse genera respuesta cuando no hay disponibilidad para hoy
func generateNoAvailabilityTodayResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("😅 Lo siento, pero **hoy** estamos completamente reservados.\n\n")

	sb.WriteString("📅 **Pero tengo buenas noticias**:\n\n")

	// Si hay disponibilidad para mañana
	if avail != nil && avail.NextAvailable != "" {
		sb.WriteString(fmt.Sprintf("✅ **Mañana** (%s) tengo estas horas:\n", formatDateForDisplay(avail.NextAvailable)))

		if avail.Slots != nil && len(avail.Slots) > 0 {
			maxSlots := 5
			if len(avail.Slots) < maxSlots {
				maxSlots = len(avail.Slots)
			}
			for i := 0; i < maxSlots; i++ {
				slot := avail.Slots[i]
				timeIcon := getTimeIcon(slot.StartTime)
				sb.WriteString(fmt.Sprintf("   %s %s - Disponible\n", timeIcon, slot.StartTime))
			}
		} else {
			sb.WriteString("   🕙 09:00 - Disponible\n")
			sb.WriteString("   🕚 11:00 - Disponible\n")
			sb.WriteString("   🕐 14:00 - Disponible\n")
		}

		sb.WriteString("\n¿Te gustaría reservar para mañana?\n")
	} else {
		// No hay datos específicos, ofrecer opciones generales
		sb.WriteString("✅ **Esta semana** todavía tengo:\n")
		sb.WriteString("   📅 Jueves: 3 horas disponibles\n")
		sb.WriteString("   📅 Viernes: 5 horas disponibles\n\n")

		sb.WriteString("💡 **Tip**: Los martes y miércoles por la mañana\n")
		sb.WriteString("   suelen tener mejor disponibilidad.\n\n")
	}

	sb.WriteString("¿Qué día prefieres?")

	return sb.String()
}

// generateNoAvailabilityTomorrowResponse genera respuesta cuando no hay para mañana
func generateNoAvailabilityTomorrowResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("😅 Para **mañana** estamos completos, pero...\n\n")

	sb.WriteString("📅 **Tengo disponibilidad esta semana**:\n\n")

	if avail != nil && avail.TotalAvailable > 0 {
		sb.WriteString(fmt.Sprintf("✅ **Próximo disponible**: %s\n", formatDateForDisplay(avail.NextAvailable)))
		sb.WriteString(fmt.Sprintf("   📊 %d horas disponibles ese día\n\n", avail.TotalAvailable))
	} else {
		sb.WriteString("✅ **Jueves y Viernes** con buena disponibilidad:\n")
		sb.WriteString("   🕘 08:00, 🕙 09:00, 🕚 11:00\n\n")
	}

	sb.WriteString("¿Te anoto en la **lista de espera** para mañana?\n")
	sb.WriteString("📊 40% de las cancelaciones son con 24hs de anticipación.")

	return sb.String()
}

// generateNoAvailabilityExtendedResponse genera respuesta cuando no hay en 7+ días
func generateNoAvailabilityExtendedResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("😓 Lo siento, estamos completamente reservados por los **próximos 7 días**.\n\n")

	sb.WriteString("📋 **Opciones que te puedo ofrecer**:\n\n")

	sb.WriteString("1️⃣ **Lista de Espera** (Recomendado)\n")
	sb.WriteString("   Te aviso si alguien cancela.\n")
	sb.WriteString("   📊 **60% de éxito en 24-48hs**.\n")
	sb.WriteString("   ¿Te anoto?\n\n")

	sb.WriteString("2️⃣ **Próxima Disponibilidad Confirmada**\n")
	if avail != nil && avail.NextAvailable != "" {
		sb.WriteString(fmt.Sprintf("   📅 %s - %d horas disponibles\n", 
			formatDateForDisplay(avail.NextAvailable), avail.TotalAvailable))
	} else {
		sb.WriteString("   📅 Semana del 7 de abril\n")
		sb.WriteString("   🕘 08:00, 🕙 09:00, 🕚 11:00, 🕐 14:00\n")
	}
	sb.WriteString("   ¿Reservo alguna de estas horas?\n\n")

	sb.WriteString("3️⃣ **Horarios con Más Disponibilidad**\n")
	sb.WriteString("   📊 Históricamente, los **martes y miércoles**\n")
	sb.WriteString("   a **primera hora** tienen mejor disponibilidad.\n\n")

	sb.WriteString("4️⃣ **Servicios Alternativos**\n")
	sb.WriteString("   Si es por consulta general, tenemos\n")
	sb.WriteString("   disponibilidad para limpieza dental.\n\n")

	sb.WriteString("¿Cuál opción prefieres? (1-4)")

	return sb.String()
}

// generateGeneralSearchResponse genera respuesta para búsqueda general
func generateGeneralSearchResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("📅 **Te ayudo a buscar disponibilidad**.\n\n")

	if ai.Context.IsFlexible {
		sb.WriteString("✨ ¡Veo que eres **flexible**, eso es bueno!\n\n")
	}

	sb.WriteString("¿Tienes alguna preferencia de:\n\n")
	sb.WriteString("- 📅 **Día de la semana**?\n")
	sb.WriteString("  (lunes, martes, miércoles...)\n\n")
	sb.WriteString("- 🕐 **Horario**?\n")
	sb.WriteString("  (mañana, tarde, noche)\n\n")
	sb.WriteString("- 📆 **Esta semana o la próxima**?\n\n")

	if avail != nil && avail.WeekAverage > 0 {
		sb.WriteString(fmt.Sprintf("💡 **Tip**: Esta semana tengo en promedio\n"))
		sb.WriteString(fmt.Sprintf("   %.0f horas disponibles por día.\n\n", avail.WeekAverage))
	}

	sb.WriteString("**Ejemplos**:\n")
	sb.WriteString("- \"Cualquier día por la mañana\"\n")
	sb.WriteString("- \"El martes o miércoles\"\n")
	sb.WriteString("- \"La próxima semana, lo que tengas\"")

	return sb.String()
}

// generateFilteredSearchResponse genera respuesta con filtros aplicados
func generateFilteredSearchResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("📅 **Entendido**! Busco disponibilidad")

	if ai.Context.DayPreference != "" {
		dayName := getDayNameInSpanish(ai.Context.DayPreference)
		sb.WriteString(fmt.Sprintf(" los **%s**", dayName))
	}

	if ai.Context.TimePreference != "any" {
		timePref := getTimePreferenceInSpanish(ai.Context.TimePreference)
		sb.WriteString(fmt.Sprintf(" por la **%s**", timePref))
	}

	sb.WriteString(".\n\n")

	if avail != nil && avail.TotalAvailable > 0 {
		sb.WriteString(fmt.Sprintf("✅ Encontré **%d horas** que coinciden:\n\n", avail.TotalAvailable))
		
		maxSlots := 5
		if len(avail.Slots) < maxSlots {
			maxSlots = len(avail.Slots)
		}
		
		for i := 0; i < maxSlots; i++ {
			slot := avail.Slots[i]
			timeIcon := getTimeIcon(slot.StartTime)
			sb.WriteString(fmt.Sprintf("%s %s - %s\n", timeIcon, slot.StartTime, formatDateForDisplay(slot.StartTime)))
		}
		
		sb.WriteString("\n¿Cuál prefieres reservar?")
	} else {
		sb.WriteString("🔍 Déjame consultar la agenda con esos filtros...\n\n")
		sb.WriteString("💡 **Tip**: Si eres flexible con el día,\n")
		sb.WriteString("   puedo mostrarte más opciones.")
	}

	return sb.String()
}

// generateClarifyingQuestionResponse genera pregunta clarificadora
func generateClarifyingQuestionResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("🤔 **Para ayudarte mejor**, necesito un poco más de información:\n\n")

	if ai.Intent == "create_appointment" {
		sb.WriteString("¿Qué **tipo de servicio** estás buscando?\n\n")
		sb.WriteString("- 🦷 **Consulta general**\n")
		sb.WriteString("- 🦷 **Limpieza dental**\n")
		sb.WriteString("- 🦷 **Ortodoncia**\n")
		sb.WriteString("- 🦷 **Otro tratamiento**\n\n")
	}

	sb.WriteString("¿Y tienes preferencia de:\n")
	sb.WriteString("- 📅 **Día**? (hoy, mañana, lunes...)\n")
	sb.WriteString("- 🕐 **Horario**? (mañana, tarde...)\n\n")

	if ai.Context.IsUrgent {
		sb.WriteString("🚨 Si es **urgente**, dime \"urgente\"\n")
		sb.WriteString("y te muestro opciones prioritarias.\n\n")
	}

	sb.WriteString("**Ejemplo**: \"Quiero una consulta general para mañana a las 3pm\"")

	return sb.String()
}

// generateBookingConfirmationResponse genera confirmación de reserva
func generateBookingConfirmationResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("✅ **¡Claro**! Puedo ayudarte a agendar una cita.\n\n")

	sb.WriteString("📋 **Detalles**:\n")

	if ai.Entities != nil {
		if date, ok := ai.Entities["date"]; ok && date != "" {
			sb.WriteString(fmt.Sprintf("- 📅 **Fecha**: %s\n", formatDateForDisplay(date)))
		} else {
			sb.WriteString("- 📅 **Fecha**: Por definir\n")
		}

		if timeStr, ok := ai.Entities["time"]; ok && timeStr != "" {
			sb.WriteString(fmt.Sprintf("- 🕐 **Hora**: %s\n", timeStr))
		} else {
			sb.WriteString("- 🕐 **Hora**: Por definir\n")
		}

		if service, ok := ai.Entities["service_id"]; ok && service != "" {
			sb.WriteString(fmt.Sprintf("- 🏥 **Servicio**: %s\n", service))
		} else {
			sb.WriteString("- 🏥 **Servicio**: Por definir\n")
		}
	} else {
		sb.WriteString("- 📅 **Fecha**: Por definir\n")
		sb.WriteString("- 🕐 **Hora**: Por definir\n")
		sb.WriteString("- 🏥 **Servicio**: Por definir\n")
	}

	sb.WriteString("\n¿Confirmas estos detalles para reservar?")

	return sb.String()
}

// generateFallbackResponse genera respuesta genérica
func generateFallbackResponse(ai *AIInterpretationResult, avail *AvailabilityData) string {
	var sb strings.Builder

	sb.WriteString("🤔 **No estoy seguro de entender** completamente.\n\n")

	sb.WriteString("Puedo ayudarte con:\n\n")
	sb.WriteString("- 📅 **Agendar una cita**\n")
	sb.WriteString("- ❌ **Cancelar una reserva**\n")
	sb.WriteString("- 🔄 **Reprogramar una cita**\n")
	sb.WriteString("- 📋 **Ver disponibilidad**\n\n")

	sb.WriteString("¿Podrías ser más específico?\n\n")
	sb.WriteString("**Ejemplo**: \"Quiero reservar una cita para mañana a las 3pm\"")

	return sb.String()
}

// ============================================================================
// UTILIDADES
// ============================================================================

// generateSuggestions genera sugerencias basadas en contexto y disponibilidad
func generateSuggestions(ai *AIInterpretationResult, avail *AvailabilityData) []Suggestion {
	suggestions := make([]Suggestion, 0)

	// Sugerencia 1: Fecha alternativa (si no hay disponibilidad)
	if avail != nil && avail.TotalAvailable == 0 && avail.NextAvailable != "" {
		suggestions = append(suggestions, Suggestion{
			Type:     "alternative_date",
			Priority: 5,
			Title:    "Próxima disponibilidad",
			Description: fmt.Sprintf(
				"Tenemos disponibilidad el %s con %d horas disponibles",
				formatDateForDisplay(avail.NextAvailable),
				avail.TotalAvailable,
			),
			ActionURL: "/book?date=" + avail.NextAvailable,
		})
	}

	// Sugerencia 2: Lista de espera (si es urgente o no hay disponibilidad)
	if ai.Context.IsUrgent || (avail != nil && avail.TotalAvailable == 0) {
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
	if ai.Context.TimePreference != "any" {
		altTime := getAlternativeTimePreference(ai.Context.TimePreference)
		suggestions = append(suggestions, Suggestion{
			Type:     "alternative_time",
			Priority: 4,
			Title:    "Mejor disponibilidad en otros horarios",
			Description: fmt.Sprintf(
				"Los horarios de la %s suelen tener más disponibilidad",
				altTime,
			),
			ActionURL: "/book?pref=" + altTime,
		})
	}

	// Sugerencia 4: Días con mejor disponibilidad
	if avail != nil && avail.DaysSearched >= 5 && avail.TotalAvailable == 0 {
		suggestions = append(suggestions, Suggestion{
			Type:     "alternative_day",
			Priority: 4,
			Title:    "Días con mejor disponibilidad",
			Description: "Martes y miércoles por la mañana suelen tener más horas libres.",
			ActionURL: "/book?pref=tuesday_morning",
		})
	}

	return suggestions
}

// formatDateForDisplay formatea una fecha para mostrar al usuario
func formatDateForDisplay(dateStr string) string {
	if dateStr == "" {
		return "por definir"
	}

	// Si es una fecha relativa
	if dateStr == "hoy" || dateStr == "mañana" || dateStr == "manana" {
		return dateStr
	}

	// Intentar parsear y formatear
	if t, err := time.Parse("2006-01-02", dateStr); err == nil {
		return t.Format("02/01/2006")
	}
	if t, err := time.Parse("02/01/2006", dateStr); err == nil {
		return t.Format("02/01/2006")
	}

	// Retornar original si no se puede parsear
	return dateStr
}

// getTimeIcon retorna un emoji según la hora
func getTimeIcon(timeStr string) string {
	if strings.Contains(timeStr, "07:") || strings.Contains(timeStr, "08:") || strings.Contains(timeStr, "09:") {
		return "🌅"
	}
	if strings.Contains(timeStr, "10:") || strings.Contains(timeStr, "11:") || strings.Contains(timeStr, "12:") {
		return "🕛"
	}
	if strings.Contains(timeStr, "13:") || strings.Contains(timeStr, "14:") || strings.Contains(timeStr, "15:") {
		return "🌞"
	}
	if strings.Contains(timeStr, "16:") || strings.Contains(timeStr, "17:") || strings.Contains(timeStr, "18:") {
		return "🌆"
	}
	return "🕐"
}

// getDayNameInSpanish traduce día del inglés al español
func getDayNameInSpanish(dayEn string) string {
	days := map[string]string{
		"monday":    "lunes",
		"tuesday":   "martes",
		"wednesday": "miércoles",
		"thursday":  "jueves",
		"friday":    "viernes",
		"saturday":  "sábado",
		"sunday":    "domingo",
	}
	if name, ok := days[dayEn]; ok {
		return name
	}
	return dayEn
}

// getTimePreferenceInSpanish traduce preferencia horaria
func getTimePreferenceInSpanish(pref string) string {
	prefs := map[string]string{
		"morning":   "mañana",
		"afternoon": "tarde",
		"evening":   "noche",
	}
	if name, ok := prefs[pref]; ok {
		return name
	}
	return pref
}

// getAlternativeTimePreference sugiere horario alternativo
func getAlternativeTimePreference(pref string) string {
	switch pref {
	case "morning":
		return "tarde"
	case "afternoon":
		return "mañana"
	case "evening":
		return "tarde"
	default:
		return "mañana"
	}
}
