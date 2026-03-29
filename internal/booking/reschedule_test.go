package booking_test

import (
	"testing"
	"time"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/pkg/types"
)

func TestRescheduleBooking_Validation(t *testing.T) {
	tests := []struct {
		name              string
		bookingID         string
		newStartTime      string
		expectedSuccess   bool
		expectedErrorCode string
	}{
		{
			name:              "rejects missing booking_id",
			bookingID:         "",
			newStartTime:      "2030-04-16T10:00:00-03:00",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects missing new_start_time",
			bookingID:         "123e4567-e89b-12d3-a456-426614174000",
			newStartTime:      "",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeMissingField,
		},
		{
			name:              "rejects invalid booking_id (not UUID)",
			bookingID:         "invalid-booking-id",
			newStartTime:      "2030-04-16T10:00:00-03:00",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidUUID,
		},
		{
			name:              "rejects new_start_time without timezone",
			bookingID:         "123e4567-e89b-12d3-a456-426614174000",
			newStartTime:      "2030-04-16T10:00:00",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidDatetime,
		},
		{
			name:              "rejects past new_start_time",
			bookingID:         "123e4567-e89b-12d3-a456-426614174000",
			newStartTime:      "2020-01-01T10:00:00-03:00",
			expectedSuccess:   false,
			expectedErrorCode: types.ErrorCodeInvalidDate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := booking.RescheduleBooking(tt.bookingID, tt.newStartTime)

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

func TestRescheduleBooking_Integration(t *testing.T) {
	t.Run("Standard Contract - Error Response Fields", func(t *testing.T) {
		res := booking.RescheduleBooking("", "")

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

	t.Run("Happy Path: reschedules an existing booking", func(t *testing.T) {
		// 1. Create a booking
		uniqueTime := getFutureRandomTime()
		createRes := booking.CreateBooking(1, 1, uniqueTime, "123", "Reschedule Test User", "", "")
		if !createRes.Success {
			t.Fatalf("Failed to create booking for reschedule test: %v", *createRes.ErrorMessage)
		}

		data := *createRes.Data
		bookingID, ok := data["id"].(string)
		if !ok || bookingID == "" {
			t.Fatalf("Failed to get booking ID from create response")
		}

		// 2. Reschedule it
		newTime := getFutureRandomTime()

		start := time.Now()
		rescheduleRes := booking.RescheduleBooking(bookingID, newTime)
		elapsed := time.Since(start)

		if !rescheduleRes.Success {
			t.Fatalf("Failed to reschedule booking: %v", *rescheduleRes.ErrorMessage)
		}

		if elapsed > 5*time.Second {
			t.Errorf("Performance: took %v, expected < 5s", elapsed)
		}
	})
}
