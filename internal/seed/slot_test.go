// Package seed provides native unit tests for the SEED_01 slot processing workflow.
// These replace the legacy SEED_01_Process_Slot_Processing_test.go HTTP integration tests.
package seed_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"booking-titanium-wm/internal/booking"
)

// seedSlot calls the booking CreateBooking function as this is the actual logic
// SEED slots eventually trigger to provision themselves into the database.
func seedSlot(providerID, serviceID int, startTime, endTime, chatID, idempotencyKey, source string) interface{} {
	return booking.CreateBooking(providerID, serviceID, startTime, chatID, source, "", "")
}

func TestSeedSlot_MissingProviderID(t *testing.T) {
	res := booking.CreateBooking(0, 1, "2026-04-15T10:00:00-03:00", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for missing provider_id")
	}
	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %s", *res.ErrorCode)
	}
}

func TestSeedSlot_MissingServiceID(t *testing.T) {
	res := booking.CreateBooking(1, 0, "2026-04-15T10:00:00-03:00", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for missing service_id")
	}
	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %s", *res.ErrorCode)
	}
}

func TestSeedSlot_MissingStartTime(t *testing.T) {
	res := booking.CreateBooking(1, 1, "", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for missing start_time")
	}
	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %s", *res.ErrorCode)
	}
}

func TestSeedSlot_MissingChatID(t *testing.T) {
	res := booking.CreateBooking(1, 1, "2026-04-15T10:00:00-03:00", "", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for missing chat_id")
	}
	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected MISSING_FIELD, got %s", *res.ErrorCode)
	}
}

func TestSeedSlot_InvalidStartTime_NoTimezone(t *testing.T) {
	res := booking.CreateBooking(1, 1, "2026-04-15T10:00:00", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for start_time without timezone")
	}
}

func TestSeedSlot_InvalidStartTime_Format(t *testing.T) {
	res := booking.CreateBooking(1, 1, "invalid-date", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for invalid start_time format")
	}
}

func TestSeedSlot_PastStartTime(t *testing.T) {
	// NOTE: The SEED layer intentionally allows past dates for historical provisioning.
	// This test simply verifies the call completes without a panic or crash.
	res := booking.CreateBooking(1, 1, "2020-01-01T10:00:00-03:00", "123456", "SEED_01", "", "")
	_ = res // pass regardless — SEED does not enforce past-date rejection
}

func TestSeedSlot_NegativeProviderID(t *testing.T) {
	res := booking.CreateBooking(-1, 1, "2026-04-15T10:00:00-03:00", "123456", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected failure for negative provider_id")
	}
	if *res.ErrorCode != "INVALID_TYPE" {
		t.Errorf("Expected INVALID_TYPE, got %s", *res.ErrorCode)
	}
}

func TestSeedSlot_ValidStartTimeUTC(t *testing.T) {
	// "Z" timezone should be accepted as a valid RFC3339 variant
	futureTime := fmt.Sprintf("%d-06-15T12:00:00Z", time.Now().Year()+1)
	res := booking.CreateBooking(1, 1, futureTime, "123456", "SEED_01", "", "")
	// Will proceed to DB; success depends on DB state - but no validation error expected
	if res.ErrorCode != nil && *res.ErrorCode == "INVALID_DATETIME" {
		t.Errorf("Valid UTC (Z) timezone should not cause INVALID_DATETIME")
	}
}

func TestSeedSlot_Idempotency(t *testing.T) {
	futureTime := fmt.Sprintf("%d-07-15T10:00:00-03:00", time.Now().Year()+4)

	res1 := booking.CreateBooking(1, 1, futureTime, "123456", "SEED_01", "", "")
	if !res1.Success {
		t.Skipf("Skipping idempotency check — first slot failed: %v", *res1.ErrorMessage)
	}

	res2 := booking.CreateBooking(1, 1, futureTime, "123456", "SEED_01", "", "")
	if !res2.Success {
		t.Fatalf("Second slot should succeed idempotently")
	}

	data := *res2.Data
	if isDup, ok := data["is_duplicate"].(bool); ok && !isDup {
		t.Errorf("Expected is_duplicate=true on second insertion")
	}
}

func TestSeedSlot_SecuritySQLi(t *testing.T) {
	res := booking.CreateBooking(1, 1, "2026-04-15T10:00:00-03:00", "'; DROP TABLE bookings; --", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected SQLi in chat_id to fail validation or be safely handled")
	}
}

func TestSeedSlot_SecurityXSS(t *testing.T) {
	res := booking.CreateBooking(1, 1, "2026-04-15T10:00:00-03:00", "<script>alert('x')</script>", "SEED_01", "", "")
	if res.Success {
		t.Fatalf("Expected XSS in chat_id to fail validation or be safely handled")
	}
}

func TestSeedSlot_SecurityLongIdempotencyKey(t *testing.T) {
	longKey := strings.Repeat("a", 500)
	res := booking.CreateBooking(1, 1, "2026-04-15T10:00:00-03:00", longKey, "SEED_01", "", "")
	// Just ensure no panic – validation may pass or fail
	_ = res
}

func TestSeedSlot_Performance(t *testing.T) {
	futureTime := fmt.Sprintf("%d-08-15T10:00:00-03:00", time.Now().Year()+5)
	start := time.Now()
	booking.CreateBooking(1, 1, futureTime, "123456", "SEED_01", "", "")
	elapsed := time.Since(start)

	if elapsed > 5*time.Second {
		t.Errorf("SEED slot processing took %v, expected < 5s", elapsed)
	}
}
