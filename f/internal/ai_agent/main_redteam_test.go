// AI Agent v2.0 - RED TEAM AGENT
// Tests de colisión de intents y falsos positivos
// Ejecutar: go test -v -run TestRedTeam

package inner

import (
	"testing"
)

// ============================================================================
// RED TEAM AGENT - COLISIÓN DE INTENTS
// ============================================================================

func TestRedTeam_IntentCollision_CancelVsCreate(t *testing.T) {
	// BUG REPORTADO: "Quiero cancelar mi cita" → detectado como create_appointment
	tests := []struct {
		name           string
		text           string
		expectedIntent string
	}{
		{
			name:           "cancelar_con_quiero",
			text:           "Quiero cancelar mi cita",
			expectedIntent: "cancel_appointment",
		},
		{
			name:           "cancelar_simple",
			text:           "Cancelar cita",
			expectedIntent: "cancel_appointment",
		},
		{
			name:           "anular_reserva",
			text:           "Necesito anular mi reserva",
			expectedIntent: "cancel_appointment",
		},
		{
			name:           "eliminar_cita",
			text:           "Quiero eliminar la cita",
			expectedIntent: "cancel_appointment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("detectIntent(%q) = %q, want %q (confidence: %.2f)",
					tt.text, result.detectedIntent, tt.expectedIntent, result.confidence)
			}
		})
	}
}

func TestRedTeam_IntentCollision_RescheduleVsCreate(t *testing.T) {
	// BUG REPORTADO: "Necesito reprogramar para el viernes" → detectado como create_appointment
	tests := []struct {
		name           string
		text           string
		expectedIntent string
	}{
		{
			name:           "reprogramar_con_para",
			text:           "Necesito reprogramar para el viernes",
			expectedIntent: "reschedule_appointment",
		},
		{
			name:           "cambiar_cita",
			text:           "Quiero cambiar mi cita",
			expectedIntent: "reschedule_appointment",
		},
		{
			name:           "mover_reserva",
			text:           "Necesito mover la reserva",
			expectedIntent: "reschedule_appointment",
		},
		{
			name:           "trasladar_cita",
			text:           "Quiero trasladar mi cita",
			expectedIntent: "reschedule_appointment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("detectIntent(%q) = %q, want %q (confidence: %.2f)",
					tt.text, result.detectedIntent, tt.expectedIntent, result.confidence)
			}
		})
	}
}

func TestRedTeam_IntentCollision_UrgencyPriority(t *testing.T) {
	// La urgencia debe tener PRIORIDAD sobre otros intents
	tests := []struct {
		name           string
		text           string
		expectedIntent string
		minConfidence  float64
	}{
		{
			name:           "urgente_con_cancelar",
			text:           "Es urgente, necesito cancelar",
			expectedIntent: "urgent_care",
			minConfidence:  0.8,
		},
		{
			name:           "emergencia_con_reprogramar",
			text:           "Emergencia, tengo que reprogramar",
			expectedIntent: "urgent_care",
			minConfidence:  0.8,
		},
		{
			name:           "urgente_con_hoy",
			text:           "Urgente, necesito hora para hoy",
			expectedIntent: "urgent_care",
			minConfidence:  0.9,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("detectIntent(%q) = %q, want %q",
					tt.text, result.detectedIntent, tt.expectedIntent)
			}
			if result.confidence < tt.minConfidence {
				t.Errorf("confidence %.2f < minimum %.2f", result.confidence, tt.minConfidence)
			}
		})
	}
}

func TestRedTeam_IntentCollision_FlexibilityDetection(t *testing.T) {
	// BUG REPORTADO: "lo que tengas" no se detecta como flexibilidad
	tests := []struct {
		name            string
		text            string
		expectedIntent  string
		expectedFlex    bool
		expectedContext AIContext
	}{
		{
			name:           "cualquier_dia",
			text:           "Me sirve cualquier día",
			expectedIntent: "check_availability",
			expectedFlex:   true,
		},
		{
			name:           "lo_que_tengas",
			text:           "Agendo lo que tengas disponible",
			expectedIntent: "check_availability",
			expectedFlex:   true,
		},
		{
			name:           "lo_que_conviene",
			text:           "Reservo lo que más conviene",
			expectedIntent: "check_availability",
			expectedFlex:   true,
		},
		{
			name:           "indistinto",
			text:           "Me es indistinto el día",
			expectedIntent: "check_availability",
			expectedFlex:   true,
		},
		{
			name:           "flexible",
			text:           "Soy flexible con los horarios",
			expectedIntent: "check_availability",
			expectedFlex:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			context := detectContext(tt.text, AIAgentEntities{})

			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("detectIntent(%q) = %q, want %q",
					tt.text, result.detectedIntent, tt.expectedIntent)
			}

			if context.is_flexible != tt.expectedFlex {
				t.Errorf("context.is_flexible = %v, want %v",
					context.is_flexible, tt.expectedFlex)
			}
		})
	}
}

func TestRedTeam_KeywordWeighting(t *testing.T) {
	// Test para verificar que las keywords de intents específicos tengan más peso
	tests := []struct {
		name           string
		text           string
		expectedIntent string
		description    string
	}{
		{
			name:           "cancelar_mayor_peso_que_quiero",
			text:           "Quiero cancelar",
			expectedIntent: "cancel_appointment",
			description:    "'cancelar' debe tener más peso que 'quiero'",
		},
		{
			name:           "reprogramar_mayor_peso_que_para",
			text:           "Reprogramar para mañana",
			expectedIntent: "reschedule_appointment",
			description:    "'reprogramar' debe tener más peso que 'para'",
		},
		{
			name:           "anular_mayor_peso_que_necesito",
			text:           "Necesito anular",
			expectedIntent: "cancel_appointment",
			description:    "'anular' debe tener más peso que 'necesito'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("FAIL: %s\n  Text: %q\n  Got: %q, Want: %q\n  Confidence: %.2f",
					tt.description, tt.text, result.detectedIntent, tt.expectedIntent, result.confidence)
			}
		})
	}
}

func TestRedTeam_NegativeCases_NoFalsePositives(t *testing.T) {
	// Casos que NO deben detectar intents incorrectos
	tests := []struct {
		name            string
		text            string
		shouldNotDetect string
	}{
		{
			name:            "pregunta_no_es_booking",
			text:            "¿Quiero saber si tienen disponibilidad?",
			shouldNotDetect: "create_appointment",
		},
		{
			name:            "saludo_no_es_booking",
			text:            "Hola, quiero saludar",
			shouldNotDetect: "create_appointment",
		},
		{
			name:            "gracias_no_es_booking",
			text:            "Gracias, quiero agradecer",
			shouldNotDetect: "create_appointment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent == tt.shouldNotDetect {
				t.Errorf("FALSE POSITIVE: detectIntent(%q) = %q, should NOT be %q",
					tt.text, result.detectedIntent, tt.shouldNotDetect)
			}
		})
	}
}

func TestRedTeam_AmbiguousPhrases(t *testing.T) {
	// Frases ambiguas que requieren contexto adicional
	tests := []struct {
		name          string
		text          string
		expectedIntent string
		minConfidence float64
	}{
		{
			name:          "cita_sin_verbo",
			text:          "Una cita para mañana",
			expectedIntent: "create_appointment",
			minConfidence:  0.5,
		},
		{
			name:          "hora_disponible",
			text:          "¿Hora disponible?",
			expectedIntent: "check_availability",
			minConfidence:  0.6,
		},
		{
			name:          "turno",
			text:          "Necesito un turno",
			expectedIntent: "create_appointment",
			minConfidence:  0.7,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(tt.text)
			if result.detectedIntent != tt.expectedIntent {
				t.Errorf("detectIntent(%q) = %q, want %q",
					tt.text, result.detectedIntent, tt.expectedIntent)
			}
			if result.confidence < tt.minConfidence {
				t.Logf("WARN: confidence %.2f < recommended %.2f (acceptable for ambiguous)",
					result.confidence, tt.minConfidence)
			}
		})
	}
}

func TestRedTeam_ContextOverride(t *testing.T) {
	// El contexto debe poder overridear el intent detectado
	tests := []struct {
		name              string
		text              string
		baseIntent        string
		contextKeywords   []string
		expectedOverride  string
	}{
		{
			name:             "create_con_urgencia",
			text:             "Quiero agendar",
			baseIntent:       "create_appointment",
			contextKeywords:  []string{"urgente", "ya"},
			expectedOverride: "urgent_care",
		},
		{
			name:             "check_con_urgencia",
			text:             "¿Tienen disponibilidad?",
			baseIntent:       "check_availability",
			contextKeywords:  []string{"emergencia", "dolor"},
			expectedOverride: "urgent_care",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fullText := tt.text + " " + joinStrings(tt.contextKeywords)
			result := detectIntent(fullText)
			
			if result.detectedIntent != tt.expectedOverride {
				t.Errorf("Context override failed: got %q, want %q",
					result.detectedIntent, tt.expectedOverride)
			}
		})
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

func joinStrings(strs []string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += " "
		}
		result += s
	}
	return result
}

// Benchmark para medir performance de detección de intents
func BenchmarkRedTeam_IntentDetection(b *testing.B) {
	testCases := []string{
		"Quiero cancelar mi cita",
		"Necesito reprogramar para el viernes",
		"Es urgente, necesito atención",
		"Me sirve cualquier día",
		"¿Tienen hora para hoy?",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, tc := range testCases {
			detectIntent(tc)
		}
	}
}
