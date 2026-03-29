package ai

import (
	"strings"
	"testing"
)

func TestAIAgent_MissingChatID(t *testing.T) {
	req := AIAgentRequest{
		Text: "Quiero reservar un turno",
	}

	res := AIAgent(req)
	if res.Success {
		t.Fatalf("Expected success=false for missing chat_id")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD error code")
	}
}

func TestAIAgent_MissingText(t *testing.T) {
	req := AIAgentRequest{
		ChatID: "123456",
	}

	res := AIAgent(req)
	if res.Success {
		t.Fatalf("Expected success=false for missing text")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD error code")
	}
}

func TestAIAgent_HappyPath(t *testing.T) {
	req := AIAgentRequest{
		ChatID: "123456",
		Text:   "Hola, quiero información sobre los servicios disponibles",
	}

	res := AIAgent(req)
	if !res.Success {
		t.Fatalf("Expected AI agent parsing to succeed natively, got %v", *res.ErrorMessage)
	}

	data := *res.Data
	if data["ai_response"] == nil {
		t.Errorf("Expected ai_response to be defined")
	}

	if data["intent"] == nil {
		t.Errorf("Expected intent to be defined")
	}

	if data["next_action"] == nil {
		t.Errorf("Expected next_action to be defined")
	}
}

func TestAIAgent_XSSInText(t *testing.T) {
	req := AIAgentRequest{
		ChatID: "123456",
		Text:   "<script>alert('xss')</script>",
	}

	res := AIAgent(req)
	if !res.Success {
		t.Fatalf("Expected AI agent to safely ingest XSS text and return a generic response struct directly without failing")
	}
	
	data := *res.Data
	if data["ai_response"] == nil {
		t.Errorf("Expected ai_response to be safely defined")
	}
}

func TestAIAgent_SQLInjectionInText(t *testing.T) {
	req := AIAgentRequest{
		ChatID: "123456",
		Text:   "'; DROP TABLE bookings; --",
	}

	res := AIAgent(req)
	if !res.Success {
		t.Fatalf("Expected AI agent to safely ingest SQLi text and return a generic response struct directly without failing")
	}
	
	data := *res.Data
	if data["ai_response"] == nil {
		t.Errorf("Expected ai_response to be safely defined")
	}
}

func TestPipelineAgent_ParsingSuccess(t *testing.T) {
	req := AIAgentRequest{
		ChatID: "123456",
		Text:   "Reservar cita para mañana",
	}

	res := PipelineAgent(req)
	if !res.Success {
		t.Fatalf("Expected PipelineAgent to succeed gracefully on positive logic: %v", *res.ErrorMessage)
	}

	data := *res.Data
	if intent, ok := data["intent"].(string); !ok || intent != "create_booking" {
		t.Errorf("Expected create_booking intent detection, got: %v", intent)
	}
}

func TestDetermineNextAction(t *testing.T) {
	tests := []struct {
		intent string
		action string
	}{
		{"create_booking", "execute:create_booking"},
		{"cancel_booking", "execute:cancel_booking"},
		{"reschedule_booking", "execute:reschedule_booking"},
		{"check_availability", "execute:check_availability"},
		{"find_next", "execute:find_next_available"},
		{"get_providers", "execute:get_providers"},
		{"get_services", "execute:get_services"},
		{"get_my_bookings", "execute:get_my_bookings"},
		{"unknown_intent", "respond:general_chat"},
	}

	for _, tc := range tests {
		t.Run(tc.intent, func(t *testing.T) {
			action := determineNextAction(tc.intent)
			if action != tc.action {
				t.Errorf("Expected %s, got %s", tc.action, action)
			}
		})
	}
}

func TestGenerateAIResponse(t *testing.T) {
	msg := generateAIResponse("any", "create_booking", nil)
	if !strings.Contains(msg, "crear una reserva") {
		t.Errorf("Expected generated response to mention specific intent verb, got %s", msg)
	}
	
	generic := generateAIResponse("any", "unknown", nil)
	if !strings.Contains(generic, "Gracias") {
		t.Errorf("Expected fallback response for unknown intent")
	}
}
