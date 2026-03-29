package booking_test

import (
	"strings"
	"testing"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/pkg/types"
)

func TestCancelBooking_Validation(t *testing.T) {
	tests := []struct {
		name               string
		bookingID          string
		cancellationReason string
		expectedSuccess    bool
		expectedErrorCode  string
	}{
		{
			name:               "rejects missing booking_id",
			bookingID:          "",
			cancellationReason: "User requested cancellation",
			expectedSuccess:    false,
			expectedErrorCode:  types.ErrorCodeMissingField,
		},
		{
			name:               "rejects invalid booking_id format",
			bookingID:          "not-a-uuid",
			cancellationReason: "User requested cancellation",
			expectedSuccess:    false,
			expectedErrorCode:  types.ErrorCodeInvalidUUID,
		},
		{
			name:               "rejects cancellation_reason exceeding length limit",
			bookingID:          "123e4567-e89b-12d3-a456-426614174000",
			cancellationReason: strings.Repeat("a", 501),
			expectedSuccess:    false,
			expectedErrorCode:  types.ErrorCodeInvalidInput,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := booking.CancelBooking(tt.bookingID, tt.cancellationReason)

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

func TestCancelBooking_Integration(t *testing.T) {
	t.Run("rejects non-existent booking_id", func(t *testing.T) {
		res := booking.CancelBooking("00000000-0000-0000-0000-000000000000", "No reason")
		if res.Success {
			t.Errorf("Expected request to fail")
		}
		if res.ErrorCode == nil || *res.ErrorCode != types.ErrorCodeBookingNotFound {
			t.Errorf("Expected ErrorCode %s", types.ErrorCodeBookingNotFound)
		}
	})

	t.Run("Happy Path: cancels an existing confirmed booking", func(t *testing.T) {
		// 1. Create a booking to cancel
		uniqueTime := getFutureRandomTime()
		createRes := booking.CreateBooking(1, 1, uniqueTime, "123", "Cancel Test User", "", "")
		if !createRes.Success {
			t.Fatalf("Failed to create booking for cancel test: %v", *createRes.ErrorMessage)
		}

		data := *createRes.Data
		bookingID, ok := data["id"].(string)
		if !ok || bookingID == "" {
			t.Fatalf("Failed to get booking ID from create response")
		}

		// 2. Cancel it
		cancelRes := booking.CancelBooking(bookingID, "Testing cancellation")
		if !cancelRes.Success {
			t.Fatalf("Failed to cancel booking: %v", *cancelRes.ErrorMessage)
		}

		cancelData := *cancelRes.Data
		if status, ok := cancelData["status"].(types.BookingStatus); !ok || status != types.BookingStatusCancelled {
			if strStatus, strOk := cancelData["status"].(string); strOk && strStatus == string(types.BookingStatusCancelled) {
				// Accept string representation
			} else {
				t.Errorf("Expected status CANCELLED, got %v", cancelData["status"])
			}
		}

		// 3. Try to cancel again (should return BOOKING_ALREADY_CANCELLED)
		cancelAgainRes := booking.CancelBooking(bookingID, "Testing double cancellation")
		if cancelAgainRes.Success {
			t.Errorf("Expected second cancellation to fail")
		}
		if cancelAgainRes.ErrorCode == nil || *cancelAgainRes.ErrorCode != types.ErrorCodeBookingAlreadyCancelled {
			t.Errorf("Expected ErrorCode %s, got %v", types.ErrorCodeBookingAlreadyCancelled, cancelAgainRes.ErrorCode)
		}
	})
}
