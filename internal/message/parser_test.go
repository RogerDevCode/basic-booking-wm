package message

import (
	"encoding/json"
	"testing"
)

func TestParseTelegramMessage_HappyPathStandard(t *testing.T) {
	payload := []byte(`{
		"message": {
			"chat": {
				"id": 123456,
				"first_name": "Test"
			},
			"text": "Reservar cita",
			"from": {
				"first_name": "Juan"
			}
		}
	}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if !res.Success {
		t.Fatalf("Expected success=true, got %v: %v", res.Success, res.ErrorMessage)
	}

	data := *res.Data
	if data["chat_id"] != "123456" {
		t.Errorf("Expected chat_id 123456, got %v", data["chat_id"])
	}
	if data["text"] != "Reservar cita" {
		t.Errorf("Expected text 'Reservar cita', got %v", data["text"])
	}
}

func TestParseTelegramMessage_ChannelPost(t *testing.T) {
	payload := []byte(`{
		"channel_post": {
			"chat": {
				"id": 789012,
				"first_name": "Channel"
			},
			"text": "Anuncio importante"
		}
	}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if !res.Success {
		t.Fatalf("Expected success=true")
	}

	data := *res.Data
	if data["chat_id"] != "789012" {
		t.Errorf("Expected chat_id 789012, got %v", data["chat_id"])
	}
}

func TestParseTelegramMessage_SanitizeText(t *testing.T) {
	payload := []byte(`{
		"message": {
			"chat": {
				"id": 111222,
				"first_name": "Test"
			},
			"text": "Test with 'quotes' and \\backslashes",
			"from": {
				"first_name": "Test"
			}
		}
	}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if !res.Success {
		t.Fatalf("Expected success=true")
	}

	data := *res.Data
	// Sanitize output should strip the quotes/backslashes depending on rules
	textStr, ok := data["text"].(string)
	if !ok {
		t.Errorf("Expected text to be a string")
	}
	if textStr == "Test with 'quotes' and \\backslashes" {
		t.Errorf("Sanitization failed to strip characters: %s", textStr)
	}
}

func TestParseTelegramMessage_MissingChatID(t *testing.T) {
	payload := []byte(`{
		"message": {
			"text": "No chat id"
		}
	}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if res.Success {
		t.Fatalf("Expected success=false for missing chat_id")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %v", *res.ErrorCode)
	}
}

func TestParseTelegramMessage_MissingText(t *testing.T) {
	payload := []byte(`{
		"message": {
			"chat": {
				"id": 999888
			}
		}
	}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if res.Success {
		t.Fatalf("Expected success=false for missing text")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %v", *res.ErrorCode)
	}
}

func TestParseTelegramMessage_EmptyPayload(t *testing.T) {
	payload := []byte(`{}`)

	res := ParseTelegramMessage(json.RawMessage(payload))
	if res.Success {
		t.Fatalf("Expected success=false for empty payload")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %v", *res.ErrorCode)
	}
}

func TestDetectIntent_Standard(t *testing.T) {
	intent := DetectIntent("Quiero reservar cita para mañana")
	if intent.Intent != "create_booking" {
		t.Errorf("Expected create_booking, got %s", intent.Intent)
	}
	
	if intent.ExtractedParams["date"] == "" {
		t.Errorf("Expected extracted date param 'mañana'")
	}
}
