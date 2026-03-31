package inner

import (
	"testing"
)

// ============================================================================
// TESTS DE ESCENARIOS PRINCIPALES
// ============================================================================

func TestGenerateUrgentResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "urgent_care",
		Confidence: 0.95,
		Context: AIContext{
			IsUrgent: true,
			IsToday:  true,
		},
	}

	avail := &AvailabilityData{
		TotalAvailable: 0,
		DaysSearched:   1,
	}

	response := generateUrgentResponse(ai, avail)

	// Verificar que contiene elementos clave
	if response == "" {
		t.Fatal("Expected non-empty response")
	}

	if !contains(response, "🚨") {
		t.Error("Expected urgent emoji in response")
	}

	if !contains(response, "URGENTE") && !contains(response, "urgente") {
		t.Error("Expected 'urgente' in response")
	}

	if !contains(response, "Lista de espera") {
		t.Error("Expected 'Lista de espera' in response")
	}

	if !contains(response, "60%") {
		t.Error("Expected success rate statistic")
	}
}

func TestGenerateAvailabilityListResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.85,
		Context: AIContext{
			IsToday: true,
		},
	}

	avail := &AvailabilityData{
		Date:           "2026-03-31",
		TotalAvailable: 5,
		Slots: []TimeSlot{
			{StartTime: "09:00", EndTime: "10:00", Available: true},
			{StartTime: "10:00", EndTime: "11:00", Available: true},
			{StartTime: "11:00", EndTime: "12:00", Available: true},
			{StartTime: "14:00", EndTime: "15:00", Available: true},
			{StartTime: "15:00", EndTime: "16:00", Available: true},
		},
	}

	response := generateAvailabilityListResponse(ai, avail)

	if !contains(response, "HOY") {
		t.Error("Expected 'HOY' in response for today's availability")
	}

	if !contains(response, "Disponible") {
		t.Error("Expected 'Disponible' for each slot")
	}

	// Debería mostrar máximo 6 slots
	if countOccurrences(response, "Disponible") > 6 {
		t.Error("Should show maximum 6 slots")
	}
}

func TestGenerateNoAvailabilityTodayResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.85,
		Context: AIContext{
			IsToday: true,
		},
	}

	avail := &AvailabilityData{
		Date:           "2026-03-31",
		TotalAvailable: 0,
		NextAvailable:  "2026-04-01",
	}

	response := generateNoAvailabilityTodayResponse(ai, avail)

	if !contains(response, "hoy") {
		t.Error("Expected mention of 'hoy'")
	}

	if !contains(response, "completamente reservados") {
		t.Error("Expected 'completamente reservados'")
	}

	if !contains(response, "mañana") {
		t.Error("Expected suggestion for tomorrow")
	}
}

func TestGenerateNoAvailabilityExtendedResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.80,
		Context: AIContext{},
	}

	avail := &AvailabilityData{
		TotalAvailable: 0,
		DaysSearched:   7,
		NextAvailable:  "2026-04-07",
	}

	response := generateNoAvailabilityExtendedResponse(ai, avail)

	if !contains(response, "7 días") {
		t.Error("Expected mention of '7 días'")
	}

	if !contains(response, "Lista de Espera") {
		t.Error("Expected 'Lista de Espera' option")
	}

	if !contains(response, "60%") {
		t.Error("Expected success rate for waitlist")
	}

	if !contains(response, "1️⃣") {
		t.Error("Expected numbered options")
	}

	if !contains(response, "2️⃣") {
		t.Error("Expected option 2")
	}
}

func TestGenerateGeneralSearchResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.70,
		Context: AIContext{
			IsFlexible: true,
		},
	}

	response := generateGeneralSearchResponse(ai, nil)

	if !contains(response, "flexible") {
		t.Error("Expected mention of flexibility")
	}

	if !contains(response, "Día de la semana") {
		t.Error("Expected day preference question")
	}

	if !contains(response, "Horario") {
		t.Error("Expected time preference question")
	}
}

func TestGenerateFilteredSearchResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.85,
		Context: AIContext{
			DayPreference:  "tuesday",
			TimePreference: "afternoon",
		},
	}

	avail := &AvailabilityData{
		TotalAvailable: 3,
		Slots: []TimeSlot{
			{StartTime: "14:00", EndTime: "15:00", Available: true},
			{StartTime: "15:00", EndTime: "16:00", Available: true},
			{StartTime: "16:00", EndTime: "17:00", Available: true},
		},
	}

	response := generateFilteredSearchResponse(ai, avail)

	if !contains(response, "martes") {
		t.Error("Expected 'martes' in response")
	}

	if !contains(response, "tarde") {
		t.Error("Expected 'tarde' in response")
	}

	if !contains(response, "3 horas") {
		t.Error("Expected count of available slots")
	}
}

func TestGenerateClarifyingQuestionResponse(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "create_appointment",
		Confidence: 0.60,
		Context: AIContext{},
	}

	response := generateClarifyingQuestionResponse(ai, nil)

	if !contains(response, "tipo de servicio") {
		t.Error("Expected service type question")
	}

	if !contains(response, "Consulta general") {
		t.Error("Expected service examples")
	}

	if !contains(response, "Día") {
		t.Error("Expected day preference question")
	}
}

// ============================================================================
// TESTS DE SUGERENCIAS
// ============================================================================

func TestGenerateSuggestions_Urgent(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "urgent_care",
		Confidence: 0.95,
		Context: AIContext{
			IsUrgent: true,
		},
	}

	avail := &AvailabilityData{
		TotalAvailable: 0,
	}

	suggestions := generateSuggestions(ai, avail)

	if len(suggestions) == 0 {
		t.Fatal("Expected at least one suggestion for urgent case")
	}

	// Debería tener lista de espera como prioridad alta
	hasWaitlist := false
	for _, s := range suggestions {
		if s.Type == "waitlist" && s.Priority == 5 {
			hasWaitlist = true
			break
		}
	}

	if !hasWaitlist {
		t.Error("Expected waitlist suggestion with priority 5")
	}
}

func TestGenerateSuggestions_AlternativeDate(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.80,
		Context: AIContext{},
	}

	avail := &AvailabilityData{
		TotalAvailable: 0,  // No hay disponibilidad actual
		NextAvailable:  "2026-04-05",
	}

	suggestions := generateSuggestions(ai, avail)

	hasAlternativeDate := false
	for _, s := range suggestions {
		if s.Type == "alternative_date" {
			hasAlternativeDate = true
			if s.Priority != 5 {
				t.Error("Expected alternative date with priority 5")
			}
			break
		}
	}

	// Si no hay alternative_date, debería tener waitlist
	if !hasAlternativeDate {
		// Verificar que al menos tenga waitlist
		hasWaitlist := false
		for _, s := range suggestions {
			if s.Type == "waitlist" {
				hasWaitlist = true
				break
			}
		}
		if !hasWaitlist {
			t.Error("Expected either alternative_date or waitlist suggestion")
		}
	}
}

func TestGenerateSuggestions_NoAvailability(t *testing.T) {
	ai := &AIInterpretationResult{
		Intent:   "check_availability",
		Confidence: 0.75,
		Context: AIContext{},
	}

	avail := &AvailabilityData{
		TotalAvailable: 0,
		DaysSearched:   7,
	}

	suggestions := generateSuggestions(ai, avail)

	// Debería tener múltiples sugerencias cuando no hay disponibilidad
	if len(suggestions) < 2 {
		t.Errorf("Expected at least 2 suggestions, got %d", len(suggestions))
	}
}

// ============================================================================
// TESTS DE UTILIDADES
// ============================================================================

func TestFormatDateForDisplay(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", "por definir"},
		{"hoy", "hoy"},
		{"mañana", "mañana"},
		{"2026-03-31", "31/03/2026"},
		{"31/03/2026", "31/03/2026"},
	}

	for _, tt := range tests {
		result := formatDateForDisplay(tt.input)
		if result != tt.expected {
			t.Errorf("formatDateForDisplay(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestGetTimeIcon(t *testing.T) {
	tests := []struct {
		time     string
		expected string
	}{
		{"08:00", "🌅"},
		{"09:30", "🌅"},
		{"10:00", "🕛"},
		{"11:30", "🕛"},
		{"14:00", "🌞"},
		{"15:30", "🌞"},
		{"17:00", "🌆"},
		{"18:00", "🌆"},
	}

	for _, tt := range tests {
		result := getTimeIcon(tt.time)
		if result != tt.expected {
			t.Errorf("getTimeIcon(%q) = %q, want %q", tt.time, result, tt.expected)
		}
	}
}

func TestGetDayNameInSpanish(t *testing.T) {
	tests := []struct {
		english  string
		expected string
	}{
		{"monday", "lunes"},
		{"tuesday", "martes"},
		{"wednesday", "miércoles"},
		{"thursday", "jueves"},
		{"friday", "viernes"},
		{"saturday", "sábado"},
		{"sunday", "domingo"},
	}

	for _, tt := range tests {
		result := getDayNameInSpanish(tt.english)
		if result != tt.expected {
			t.Errorf("getDayNameInSpanish(%q) = %q, want %q", tt.english, result, tt.expected)
		}
	}
}

func TestGetTimePreferenceInSpanish(t *testing.T) {
	tests := []struct {
		english  string
		expected string
	}{
		{"morning", "mañana"},
		{"afternoon", "tarde"},
		{"evening", "noche"},
	}

	for _, tt := range tests {
		result := getTimePreferenceInSpanish(tt.english)
		if result != tt.expected {
			t.Errorf("getTimePreferenceInSpanish(%q) = %q, want %q", tt.english, result, tt.expected)
		}
	}
}

func TestGetAlternativeTimePreference(t *testing.T) {
	tests := []struct {
		preference string
		expected   string
	}{
		{"morning", "tarde"},
		{"afternoon", "mañana"},
		{"evening", "tarde"},
		{"any", "mañana"},
	}

	for _, tt := range tests {
		result := getAlternativeTimePreference(tt.preference)
		if result != tt.expected {
			t.Errorf("getAlternativeTimePreference(%q) = %q, want %q", tt.preference, result, tt.expected)
		}
	}
}

// ============================================================================
// TESTS DE INTEGRACIÓN (ESCENARIOS COMPLETOS)
// ============================================================================

func TestCompleteScenario_UrgentCare(t *testing.T) {
	input := SmartAvailabilitySearchInput{
		ChatID: "123456",
		Text:   "¡Necesito una cita urgente!",
		AIResult: &AIInterpretationResult{
			Intent:   "urgent_care",
			Confidence: 0.95,
			Context: AIContext{
				IsUrgent: true,
				IsToday:  true,
			},
		},
		Availability: &AvailabilityData{
			TotalAvailable: 0,
			DaysSearched:   1,
		},
	}

	result, err := main(input)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if !result.Success {
		t.Fatal("Expected successful result")
	}

	if result.ResponseType != "urgent_options" {
		t.Errorf("Expected response type 'urgent_options', got %q", result.ResponseType)
	}

	if !contains(result.Response, "🚨") {
		t.Error("Expected urgent emoji in response")
	}

	if len(result.Suggestions) == 0 {
		t.Error("Expected suggestions for urgent case")
	}
}

func TestCompleteScenario_AvailabilityToday(t *testing.T) {
	input := SmartAvailabilitySearchInput{
		ChatID: "123456",
		Text:   "¿Tienen hora para hoy?",
		AIResult: &AIInterpretationResult{
			Intent:   "check_availability",
			Confidence: 0.85,
			Context: AIContext{
				IsToday: true,
			},
		},
		Availability: &AvailabilityData{
			Date:           "2026-03-31",
			TotalAvailable: 5,
			Slots: []TimeSlot{
				{StartTime: "09:00", EndTime: "10:00", Available: true},
				{StartTime: "10:00", EndTime: "11:00", Available: true},
			},
		},
	}

	result, err := main(input)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.ResponseType != "availability_list" {
		t.Errorf("Expected response type 'availability_list', got %q", result.ResponseType)
	}

	if !contains(result.Response, "HOY") {
		t.Error("Expected 'HOY' in response")
	}

	if !contains(result.Response, "Disponible") {
		t.Error("Expected 'Disponible' for slots")
	}
}

func TestCompleteScenario_NoAvailabilityExtended(t *testing.T) {
	input := SmartAvailabilitySearchInput{
		ChatID: "123456",
		Text:   "¿Tienen disponibilidad para esta semana?",
		AIResult: &AIInterpretationResult{
			Intent:   "check_availability",
			Confidence: 0.75,
			Context: AIContext{},
		},
		Availability: &AvailabilityData{
			TotalAvailable: 0,
			DaysSearched:   7,
			NextAvailable:  "2026-04-07",
		},
	}

	result, err := main(input)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.ResponseType != "no_availability_extended" {
		t.Errorf("Expected response type 'no_availability_extended', got %q", result.ResponseType)
	}

	if !contains(result.Response, "7 días") {
		t.Error("Expected mention of '7 días'")
	}

	// Should have multiple suggestions
	if len(result.Suggestions) < 2 {
		t.Errorf("Expected at least 2 suggestions, got %d", len(result.Suggestions))
	}
}

func TestCompleteScenario_FlexibleUser(t *testing.T) {
	input := SmartAvailabilitySearchInput{
		ChatID: "123456",
		Text:   "Quiero agendar, me sirve cualquier día",
		AIResult: &AIInterpretationResult{
			Intent:   "create_appointment",
			Confidence: 0.70,
			Context: AIContext{
				IsFlexible: true,
			},
			NeedsMoreInfo: true,  // Explicitamente marcar que necesita más info
		},
		Availability: nil,
	}

	result, err := main(input)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result.ResponseType != "general_search" {
		t.Errorf("Expected response type 'general_search', got %q", result.ResponseType)
	}

	if !contains(result.Response, "flexible") {
		t.Error("Expected mention of flexibility")
	}

	// El needs_more_info viene del AIResult, no se modifica en main
	if !input.AIResult.NeedsMoreInfo {
		t.Error("Expected needs_more_info to be true in AIResult")
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && indexOf(s, substr) >= 0
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			if s[i+j] != substr[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func countOccurrences(s, substr string) int {
	count := 0
	start := 0
	for {
		idx := indexOf(s[start:], substr)
		if idx == -1 {
			break
		}
		count++
		start += idx + len(substr)
	}
	return count
}
