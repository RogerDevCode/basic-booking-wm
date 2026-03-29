package communication

import (
	"strings"
	"testing"
)

func TestSendMessage_MissingText(t *testing.T) {
	// Testing empty text payload exactly like NN_04 integration does
	res := SendMessage("123456", "", "")
	
	if res.Success {
		t.Fatalf("Expected SendMessage to fail for empty string text")
	}

	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD error code, got %s", *res.ErrorCode)
	}
}

func TestSendMessage_InvalidChatIDAlpha(t *testing.T) {
	res := SendMessage("invalid", "Valid Text", "")
	
	if res.Success {
		t.Fatalf("Expected SendMessage to fail for non-numeric chat ID")
	}

	// ValidateChatID returning an invalid response
	if *res.ErrorCode != "INVALID_TYPE" && *res.ErrorCode != "VALIDATION_ERROR" {
		t.Errorf("Expected invalid type validation error, got %s", *res.ErrorCode)
	}
}

func TestSendMessage_InvalidChatIDNegative(t *testing.T) {
	res := SendMessage("-123456", "Valid Text", "")
	
	if res.Success {
		t.Fatalf("Expected SendMessage to fail for negative chat ID")
	}
}

func TestSendMessage_InvalidChatIDZero(t *testing.T) {
	res := SendMessage("0", "Valid Text", "")
	
	if res.Success {
		t.Fatalf("Expected SendMessage to fail for zero chat ID")
	}
}

func TestSendMessage_SanitizeMarkdown(t *testing.T) {
	dirtyText := "Text with [brackets] and *asterisks*"
	escaped := sanitizeForMarkdownV2(dirtyText)

	if !strings.Contains(escaped, "\\[") || !strings.Contains(escaped, "\\*") {
		t.Errorf("Expected markdown special characters to be escaped by sanitize function, got %s", escaped)
	}
}

// Emulating the test checking Standard Contract formatting on Network Proxy failures/unconfigured tokens
func TestSendMessage_ProxyFailFormat(t *testing.T) {
	res := SendMessage("123456", "Valid text", "")

	if res.Success {
		t.Fatalf("Expected Telegram integration to cleanly fail dialing without tokens/N8n active")
	}

	if res.Meta.Source == "" {
		t.Errorf("Expected _meta.source to be defined even in error states")
	}
	if res.Meta.Timestamp == "" {
		t.Errorf("Expected _meta.timestamp to always be defined")
	}
}

func TestSendReminder_Cron(t *testing.T) {
	res := SendReminder("123456", "uuid-1234-booking", "Teeth Cleaning", "2026-06-15T15:00:00Z", 24)

	// Will fail immediately at telegram network transit, but verifies argument formatting locally
	if res.Success {
		t.Fatalf("Expected Telegram integration to fail dialing natively")
	}
	
	if res.Meta.Source != "NN_05_Reminder_Cron" {
		t.Errorf("Expected source to be correctly rewritten to NN_05_Reminder_Cron, got %s", res.Meta.Source)
	}

	if res.Meta.WorkflowID != "reminder-cron-v1" {
		t.Errorf("Expected workflowID to be correctly rewritten to reminder-cron-v1")
	}
}

func TestSendBookingConfirmation(t *testing.T) {
	res := SendTelegramBookingConfirmation("123456", "uuid-conf", "Dr Smith", "Exam", "2026-06-16T15:00:00Z")
	
	if res.Success {
		t.Fatalf("Expected Telegram integration to fail dialing natively")
	}
	
	if res.Meta.Source != "NN_04_Telegram_Sender" {
		t.Errorf("Expected standard telegram source mapping, got %s", res.Meta.Source)
	}
}

func TestSendBookingCancellation(t *testing.T) {
	res := SendTelegramBookingCancellation("123456", "uuid-canc", "Request refund.")
	
	if res.Success {
		t.Fatalf("Expected Telegram integration to fail dialing natively")
	}
}
