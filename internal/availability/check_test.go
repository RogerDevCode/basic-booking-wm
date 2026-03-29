package availability_test

import (
	"testing"
	"time"

	"booking-titanium-wm/internal/availability"
)

func TestCheckAvailability_Validation(t *testing.T) {
	tests := []struct {
		name              string
		providerID        int
		serviceID         int
		date              string
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing provider_id",
			providerID:        0,
			serviceID:         1,
			date:              "2026-04-15",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects missing service_id",
			providerID:        1,
			serviceID:         0,
			date:              "2026-04-15",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects missing date",
			providerID:        1,
			serviceID:         1,
			date:              "",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects invalid provider_id (negative)",
			providerID:        -1,
			serviceID:         1,
			date:              "2026-04-15",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_TYPE",
		},
		{
			name:              "rejects invalid service_id (negative)",
			providerID:        1,
			serviceID:         -1,
			date:              "2026-04-15",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_TYPE",
		},
		{
			name:              "rejects invalid date format",
			providerID:        1,
			serviceID:         1,
			date:              "15-04-2026",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_DATE",
		},
		{
			name:              "rejects invalid date (Feb 30)",
			providerID:        1,
			serviceID:         1,
			date:              "2026-02-30",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_DATE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := availability.CheckAvailability(tt.providerID, tt.serviceID, tt.date)

			if res.Success != tt.expectedSuccess {
				t.Errorf("Expected Success=%v, got %v", tt.expectedSuccess, res.Success)
			}

			if !tt.expectedSuccess {
				if res.ErrorCode == nil {
					t.Fatalf("Expected ErrorCode %s but got nil", tt.expectedErrorCode)
				}

				if *res.ErrorCode != tt.expectedErrorCode {
					t.Errorf("Expected ErrorCode %s, got %s", tt.expectedErrorCode, *res.ErrorCode)
				}
			}
		})
	}
}

func TestCheckAvailability_Integration(t *testing.T) {
	t.Run("Standard Contract - response has all required fields", func(t *testing.T) {
		res := availability.CheckAvailability(1, 1, "2026-04-15")

		if res.Meta.Source == "" || res.Meta.Timestamp == "" || res.Meta.WorkflowID == "" {
			t.Errorf("Expected Meta fields to be populated")
		}
	})

	t.Run("Performance - response time < 5 seconds", func(t *testing.T) {
		start := time.Now()
		res := availability.CheckAvailability(1, 1, "2026-04-15")
		elapsed := time.Since(start)

		if elapsed > 5*time.Second {
			t.Errorf("Performance test failed: took %v (expected < 5s)", elapsed)
		} else {
			t.Logf("Performance test passed: took %v, success=%v", elapsed, res.Success)
		}
	})
}

func TestFindNextAvailable_Validation(t *testing.T) {
	tests := []struct {
		name              string
		providerID        int
		serviceID         int
		date              string
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing provider_id",
			providerID:        0,
			serviceID:         1,
			date:              "2026-03-06",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects invalid provider_id (negative)",
			providerID:        -1,
			serviceID:         1,
			date:              "2026-03-06",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_TYPE",
		},
		{
			name:              "rejects missing service_id",
			providerID:        1,
			serviceID:         0,
			date:              "2026-03-06",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects missing date",
			providerID:        1,
			serviceID:         1,
			date:              "",
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects invalid date format",
			providerID:        1,
			serviceID:         1,
			date:              "06-03-2026",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_DATE",
		},
		{
			name:              "rejects invalid date (Feb 30)",
			providerID:        1,
			serviceID:         1,
			date:              "2026-02-30",
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_DATE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := availability.FindNextAvailable(tt.providerID, tt.serviceID, tt.date)

			if res.Success != tt.expectedSuccess {
				t.Errorf("Expected Success=%v, got %v", tt.expectedSuccess, res.Success)
			}

			if !tt.expectedSuccess {
				if res.ErrorCode == nil {
					t.Fatalf("Expected ErrorCode %s but got nil", tt.expectedErrorCode)
				}

				if *res.ErrorCode != tt.expectedErrorCode {
					t.Errorf("Expected ErrorCode %s, got %s", tt.expectedErrorCode, *res.ErrorCode)
				}
			}
		})
	}
}

func TestFindNextAvailable_Integration(t *testing.T) {
	t.Run("Happy Path - returns next available or proper standard contract", func(t *testing.T) {
		res := availability.FindNextAvailable(1, 1, "2026-03-06")

		if res.Meta.Source != "DB_Find_Next_Available" {
			t.Errorf("Expected Source=DB_Find_Next_Available, got %s", res.Meta.Source)
		}

		if res.Success {
			if res.Data == nil {
				t.Errorf("Expected Data when success is true")
			}
		} else {
			if res.ErrorCode == nil {
				t.Errorf("Expected ErrorCode when success is false")
			}
		}
	})

	t.Run("Performance - multiple sequential searches", func(t *testing.T) {
		start := time.Now()

		dates := []string{"2026-04-15", "2026-04-16", "2026-04-17"}
		for _, date := range dates {
			availability.FindNextAvailable(1, 1, date)
		}

		elapsed := time.Since(start)
		if elapsed > 15*time.Second {
			t.Errorf("Sequential searches took too long: %v", elapsed)
		}
	})
}
