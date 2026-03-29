package providers_test

import (
	"testing"
	"time"

	"booking-titanium-wm/internal/providers"
)

func TestGetProviders_Integration(t *testing.T) {
	t.Run("Happy Path - GET all providers", func(t *testing.T) {
		res := providers.GetProviders()

		if res.Meta.Source == "" {
			t.Errorf("Expected standard contract Meta to be populated")
		}

		if res.Success {
			if res.Data == nil {
				t.Fatalf("Expected Data when success is true")
			}
			data := *res.Data
			if _, ok := data["providers"]; !ok {
				t.Errorf("Expected providers key in Data")
			}
			if _, ok := data["total"]; !ok {
				t.Errorf("Expected total key in Data")
			}
		} else {
			if res.ErrorCode == nil {
				t.Errorf("Expected ErrorCode when success is false")
			}
		}
	})

	t.Run("Performance - response time < 3 seconds", func(t *testing.T) {
		start := time.Now()
		res := providers.GetProviders()
		elapsed := time.Since(start)

		if elapsed > 3*time.Second {
			t.Errorf("Performance test failed: took %v (expected < 3s)", elapsed)
		} else {
			t.Logf("Performance test passed: took %v, success=%v", elapsed, res.Success)
		}
	})
}

func TestGetServices_Integration(t *testing.T) {
	t.Run("Happy Path - GET all services", func(t *testing.T) {
		res := providers.GetServices()

		if res.Meta.Source == "" {
			t.Errorf("Expected standard contract Meta to be populated")
		}

		if res.Success {
			if res.Data == nil {
				t.Fatalf("Expected Data when success is true")
			}
			data := *res.Data
			if _, ok := data["services"]; !ok {
				t.Errorf("Expected services key in Data")
			}
			if _, ok := data["total"]; !ok {
				t.Errorf("Expected total key in Data")
			}
		} else {
			if res.ErrorCode == nil {
				t.Errorf("Expected ErrorCode when success is false")
			}
		}
	})
}

func TestGetProvidersByService_Validation(t *testing.T) {
	tests := []struct {
		name              string
		serviceID         int
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing service_id (0)",
			serviceID:         0,
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects invalid service_id (negative)",
			serviceID:         -1,
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_TYPE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := providers.GetProvidersByService(tt.serviceID)

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

func TestGetProvidersByService_Integration(t *testing.T) {
	t.Run("Happy Path - fetch providers for service_id=1", func(t *testing.T) {
		res := providers.GetProvidersByService(1)

		if res.Success {
			if res.Data == nil {
				t.Fatalf("Expected Data when success is true")
			}
			data := *res.Data
			if sid, ok := data["service_id"].(int); !ok || sid != 1 {
				t.Errorf("Expected service_id=1 in Data")
			}
		}
	})
}

func TestGetServicesByProvider_Validation(t *testing.T) {
	tests := []struct {
		name              string
		providerID        int
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing provider_id (0)",
			providerID:        0,
			expectedSuccess:   false,
			expectedErrorCode: "MISSING_FIELD",
		},
		{
			name:              "rejects invalid provider_id (negative)",
			providerID:        -1,
			expectedSuccess:   false,
			expectedErrorCode: "INVALID_TYPE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := providers.GetServicesByProvider(tt.providerID)

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

func TestGetServicesByProvider_Integration(t *testing.T) {
	t.Run("Happy Path - fetch services for provider_id=1", func(t *testing.T) {
		res := providers.GetServicesByProvider(1)

		if res.Success {
			if res.Data == nil {
				t.Fatalf("Expected Data when success is true")
			}
			data := *res.Data
			if pid, ok := data["provider_id"].(int); !ok || pid != 1 {
				t.Errorf("Expected provider_id=1 in Data")
			}
		}
	})
}
