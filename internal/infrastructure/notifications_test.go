package infrastructure

import (
	"testing"
)

func TestGCalDeleteEvent_MissingEventID(t *testing.T) {
	resp := GCalDeleteEvent("")
	if resp.Success {
		t.Errorf("Expected failure for missing event ID")
	}
	if resp.ErrorCode == nil || *resp.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected error_code MISSING_FIELD, got %v", resp.ErrorCode)
	}
}

func TestGCalDeleteEvent_Security(t *testing.T) {
	tests := []struct {
		name    string
		eventID string
	}{
		{"SQLi", "'; DROP TABLE events; --"},
		{"XSS", "<script>alert('xss')</script>"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp := GCalDeleteEvent(tc.eventID)
			if resp.Success {
				t.Errorf("Expected transaction to fail or sanitize Security violation")
			}
			if resp.ErrorCode == nil || *resp.ErrorCode != "INVALID_INPUT" {
				t.Errorf("Expected error_code INVALID_INPUT, got %v", resp.ErrorCode)
			}
			if resp.Meta.Source == "" || resp.Meta.WorkflowID == "" {
				t.Errorf("Expected Standard Contract metadata despite error block")
			}
		})
	}
}

func TestGCalDeleteEvent_Success(t *testing.T) {
	resp := GCalDeleteEvent("valid_event_xyz")
	if !resp.Success {
		t.Errorf("Expected success for valid event ID, got error: %v", resp.ErrorMessage)
	}
	data := *resp.Data
	if data["deleted"] != true || data["event_id"] != "valid_event_xyz" {
		t.Errorf("Expected payload not correctly populated: %#v", data)
	}
}

func TestGMailSendConfirmation_Validations(t *testing.T) {
	t.Run("Missing Email", func(t *testing.T) {
		resp := GMailSendConfirmation("", "Test User", "2026-03-24T10:00:00Z")
		if resp.Success {
			t.Errorf("Expected failure for missing email")
		}
		if resp.ErrorCode == nil || *resp.ErrorCode != "MISSING_FIELD" {
			t.Errorf("Expected error_code MISSING_FIELD, got %v", resp.ErrorCode)
		}
	})

	t.Run("Invalid Email No Domain", func(t *testing.T) {
		resp := GMailSendConfirmation("test@", "Test User", "2026-03-24T10:00:00Z")
		if resp.Success {
			t.Errorf("Expected failure for invalid email (no domain)")
		}
		if resp.ErrorCode == nil || *resp.ErrorCode != "INVALID_TYPE" {
			t.Errorf("Expected error_code INVALID_TYPE, got %v", resp.ErrorCode)
		}
	})

	t.Run("Invalid Email No At Symbol", func(t *testing.T) {
		resp := GMailSendConfirmation("test.com", "Test User", "2026-03-24T10:00:00Z")
		if resp.Success {
			t.Errorf("Expected failure for invalid email (no at)")
		}
		if resp.ErrorCode == nil || *resp.ErrorCode != "INVALID_TYPE" {
			t.Errorf("Expected error_code INVALID_TYPE, got %v", resp.ErrorCode)
		}
	})
}

func TestGMailSendConfirmation_Success(t *testing.T) {
	resp := GMailSendConfirmation("baba.orere@gmail.com", "Test User", "2026-03-24T10:00:00Z")
	if !resp.Success {
		t.Errorf("Expected success for valid email")
	}
	
	if resp.Meta.Source == "" || resp.Meta.WorkflowID == "" || resp.Meta.Timestamp == "" {
		t.Errorf("Expected Standard Contract metadata on valid result")
	}
}

func resToMap(data interface{}) map[string]interface{} {
	if m, ok := data.(map[string]interface{}); ok {
		return m
	}
	if m, ok := data.(map[string]any); ok {
		return m
	}
	return nil
}
