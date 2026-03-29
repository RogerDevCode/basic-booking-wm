package booking_test

import (
	"fmt"
	"math/rand"
	"testing"
	"time"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/pkg/types"
)

// Helper function to generate a random future date to avoid collisions
func getFutureRandomTime() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	year := 2030 + r.Intn(10) // 2030 to 2039
	hour := 10 + r.Intn(8)    // 10 to 17
	return fmt.Sprintf("%d-04-15T%02d:00:00-03:00", year, hour)
}

func TestCreateBooking_Validation(t *testing.T) {
	tests := []struct {
		name              string
		providerID        int
		serviceID         int
		startTime         string
		chatID            string
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing provider_id",
			providerID:        0, // 0 in Go simulates missing int value from JSON
			serviceID:         1,
			startTime:         "2030-04-15T10:00:00-03:00",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects missing service_id",
			providerID:        1,
			serviceID:         0,
			startTime:         "2030-04-15T10:00:00-03:00",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects missing start_time",
			providerID:        1,
			serviceID:         1,
			startTime:         "",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects missing chat_id",
			providerID:        1,
			serviceID:         1,
			startTime:         "2030-04-15T10:00:00-03:00",
			chatID:            "",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects invalid provider_id (negative)",
			providerID:        -1,
			serviceID:         1,
			startTime:         "2030-04-15T10:00:00-03:00",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidType,
		},
		{
			name:              "rejects start_time without timezone",
			providerID:        1,
			serviceID:         1,
			startTime:         "2030-04-15T10:00:00",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidDatetime,
		},
		{
			name:              "rejects invalid date (Feb 30)",
			providerID:        1,
			serviceID:         1,
			startTime:         "2030-02-30T10:00:00-03:00",
			chatID:            "123456",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidDatetime,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := booking.CreateBooking(
				tt.providerID,
				tt.serviceID,
				tt.startTime,
				tt.chatID,
				"Test User",
				"test@example.com",
				"",
			)

			if res.Success != tt.expectedSuccess {
				t.Errorf("Expected Success=%v, got %v", tt.expectedSuccess, res.Success)
			}

			if res.ErrorCode == nil {
				t.Fatalf("Expected ErrorCode %s but got nil", tt.expectedErrorCode)
			}

			if *res.ErrorCode != tt.expectedErrorCode {
				t.Errorf("Expected ErrorCode %s, got %s", tt.expectedErrorCode, *res.ErrorCode)
			}
		})
	}
}

// Integration Test - requires DATABASE_URL to be set
func TestCreateBooking_Integration(t *testing.T) {
	t.Run("Standard Contract - Error Response Fields", func(t *testing.T) {
		res := booking.CreateBooking(0, 0, "", "", "", "", "")

		if res.Success {
			t.Errorf("Expected request to fail")
		}
		if res.ErrorCode == nil {
			t.Errorf("Expected error_code to be populated")
		}
		if res.ErrorMessage == nil {
			t.Errorf("Expected error_message to be populated")
		}
		if res.Meta.Source == "" || res.Meta.Timestamp == "" {
			t.Errorf("Expected Meta fields to be populated")
		}
	})

	t.Run("Idempotency - duplicate request returns is_duplicate:true", func(t *testing.T) {
		uniqueTime := getFutureRandomTime()
		chatID := "123" // Valid user in DB

		// Primer Request
		res1 := booking.CreateBooking(1, 1, uniqueTime, chatID, "Idem User", "", "")

		if !res1.Success {
			errCode := "unknown"
			if res1.ErrorCode != nil {
				errCode = *res1.ErrorCode
			}
			errMsg := "unknown"
			if res1.ErrorMessage != nil {
				errMsg = *res1.ErrorMessage
			}
			t.Fatalf("First request failed. DB connection issue? Code: %s, Message: %s", errCode, errMsg)
		}

		// Segundo Request (Mismos datos)
		res2 := booking.CreateBooking(1, 1, uniqueTime, chatID, "Idem User", "", "")

		if !res2.Success {
			t.Fatalf("Second request should succeed as duplicate, but failed")
		}

		if res2.Data == nil {
			t.Fatalf("Second request returned no data")
		}

		data := *res2.Data
		isDuplicate, ok := data["is_duplicate"].(bool)
		if !ok || !isDuplicate {
			t.Errorf("Expected is_duplicate to be true")
		}
	})

	t.Run("Performance - response time < 5 seconds", func(t *testing.T) {
		uniqueTime := getFutureRandomTime()

		start := time.Now()
		res := booking.CreateBooking(1, 1, uniqueTime, "123", "Perf User", "", "")
		elapsed := time.Since(start)

		if !res.Success {
			t.Logf("Performance request didn't succeed, but testing time anyway")
		}

		if elapsed > 5*time.Second {
			t.Errorf("Performance test failed: took %v (expected < 5s)", elapsed)
		} else {
			t.Logf("Performance test passed: took %v", elapsed)
		}
	})
}
