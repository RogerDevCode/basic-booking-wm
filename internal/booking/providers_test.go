package booking

import (
	"testing"
)

func TestGetProviders_FilterParsing(t *testing.T) {
	t.Run("Rejects invalid boolean formats", func(t *testing.T) {
		resp := GetProviders("yes")
		if resp.Success {
			t.Errorf("Expected failure for invalid string filter 'yes'")
		}
		if resp.ErrorCode == nil || *resp.ErrorCode != "INVALID_INPUT" {
			t.Errorf("Expected error_code INVALID_INPUT, got %v", resp.ErrorCode)
		}
	})

	t.Run("Rejects integers", func(t *testing.T) {
		resp := GetProviders(100)
		if resp.Success {
			t.Errorf("Expected failure for numeric filter 100")
		}
	})

	t.Run("Accepts explicit bol", func(t *testing.T) {
		resp := GetProviders(true)
		if !resp.Success {
			t.Errorf("Expected success for bool true")
		}
	})

	t.Run("Accepts string true/1", func(t *testing.T) {
		configs := []string{"true", "1", "false", "0"}
		for _, cfg := range configs {
			resp := GetProviders(cfg)
			if !resp.Success {
				t.Errorf("Expected success for string configuration '%s'", cfg)
			}
		}
	})
}

func TestGetProviders_SuccessFetch(t *testing.T) {
	resp := GetProviders(nil) // Fetch all
	if !resp.Success {
		t.Fatalf("Failed to fetch all providers: %v", *resp.ErrorMessage)
	}

	data := *resp.Data
	if _, ok := data["providers"]; !ok {
		t.Errorf("Expected 'providers' array in response")
	}

	if data["total"].(int) < 0 {
		t.Errorf("Expected valid provider count, got %v", data["total"])
	}

	if resp.Meta.Source == "" || resp.Meta.WorkflowID == "" {
		t.Errorf("Expected Standard Contract metadata")
	}
}
