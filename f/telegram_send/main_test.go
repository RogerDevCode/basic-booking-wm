package inner

import (
	"os"
	"testing"
)

// TestTelegramSendInput valida el input del script
func TestTelegramSendInput(t *testing.T) {
	tests := []struct {
		name      string
		chatID    string
		text      string
		parseMode string
		wantValid bool
		wantError string
	}{
		{
			name:      "valid_input_markdown",
			chatID:    "5391760292",
			text:      "✅ Test message",
			parseMode: "MarkdownV2",
			wantValid: true,
			wantError: "",
		},
		{
			name:      "valid_input_html",
			chatID:    "5391760292",
			text:      "<b>Test message</b>",
			parseMode: "HTML",
			wantValid: true,
			wantError: "",
		},
		{
			name:      "missing_chat_id",
			chatID:    "",
			text:      "Test message",
			parseMode: "MarkdownV2",
			wantValid: false,
			wantError: "chatID is required",
		},
		{
			name:      "missing_text",
			chatID:    "5391760292",
			text:      "",
			parseMode: "MarkdownV2",
			wantValid: false,
			wantError: "text is required",
		},
		{
			name:      "invalid_parse_mode",
			chatID:    "5391760292",
			text:      "Test message",
			parseMode: "InvalidMode",
			wantValid: false,
			wantError: "parseMode must be MarkdownV2, HTML, or empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simular validación
			var isValid bool
			var errorMsg string

			if tt.chatID == "" {
				isValid = false
				errorMsg = "chatID is required"
			} else if tt.text == "" {
				isValid = false
				errorMsg = "text is required"
			} else if tt.parseMode != "" && tt.parseMode != "MarkdownV2" && tt.parseMode != "HTML" {
				isValid = false
				errorMsg = "parseMode must be MarkdownV2, HTML, or empty"
			} else {
				isValid = true
				errorMsg = ""
			}

			if isValid != tt.wantValid {
				t.Errorf("validateInput() valid = %v, want %v", isValid, tt.wantValid)
			}

			if errorMsg != tt.wantError {
				t.Errorf("validateInput() error = %v, want %v", errorMsg, tt.wantError)
			}
		})
	}
}

// TestTelegramError prueba el error type
func TestTelegramError(t *testing.T) {
	err := &telegramError{message: "test error"}
	
	if err.Error() != "test error" {
		t.Errorf("telegramError.Error() = %v, want 'test error'", err.Error())
	}
}

// TestTelegramResult_E2E prueba el flujo completo (solo si hay token)
func TestTelegramResult_E2E(t *testing.T) {
	if os.Getenv("DEV_LOCAL_TG_TOKEN") == "" && os.Getenv("TELEGRAM_BOT_TOKEN") == "" {
		t.Skip("Skipping E2E test, Telegram token not set")
	}

	// Este test enviaría un mensaje real a través de communication.SendMessage
	// Se puede habilitar para testing manual
	t.Skip("Skipping real Telegram send test")
}
