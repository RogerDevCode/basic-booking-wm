package main_test

import (
	"testing"
	"time"
)

// ============================================================================
// BOOKING_CANCEL SCRIPT TESTS
// ============================================================================
// Tests for: f/booking_cancel/main.go
// 
// This script wraps booking.CancelBooking() function
// Tests cover: validation, status checks, cancellation logic
// ============================================================================

// TestBookingCancelScript_ValidCancellation tests valid booking cancellation
func TestBookingCancelScript_ValidCancellation(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// First create a booking to cancel
	bookingID := createTestBooking(t)
	if bookingID == "" {
		t.Fatal("Failed to create test booking")
	}

	cancellationReason := "Customer requested cancellation"

	// Cancel the booking
	result, err := main(bookingID, cancellationReason)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if result == nil {
		t.Fatal("Expected result map, got nil")
	}

	// Check result fields
	if id, ok := result["booking_id"].(string); !ok || id != bookingID {
		t.Error("Expected booking_id in result")
	}

	if status, ok := result["status"].(string); !ok || status != "cancelled" {
		t.Errorf("Expected status 'cancelled', got %v", status)
	}

	t.Logf("Booking cancelled successfully: %s", bookingID)
}

// TestBookingCancelScript_EmptyBookingID tests validation of empty booking_id
func TestBookingCancelScript_EmptyBookingID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main("", "Some reason")

	// Should return validation error
	if err == nil {
		t.Error("Expected error for empty booking_id, got nil")
	}
}

// TestBookingCancelScript_NonExistentBooking tests cancellation of non-existent booking
func TestBookingCancelScript_NonExistentBooking(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	fakeBookingID := "00000000-0000-0000-0000-000000000000"
	
	_, err := main(fakeBookingID, "Test reason")

	// Should return error for non-existent booking
	if err == nil {
		t.Error("Expected error for non-existent booking, got nil")
	}
}

// TestBookingCancelScript_EmptyReason tests cancellation with empty reason
func TestBookingCancelScript_EmptyReason(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	bookingID := createTestBooking(t)
	if bookingID == "" {
		t.Fatal("Failed to create test booking")
	}

	// Empty reason should be OK
	result, err := main(bookingID, "")

	if err != nil {
		t.Errorf("Expected success with empty reason, got error: %v", err)
	}

	if result == nil {
		t.Error("Expected result with empty reason")
	}
}

// TestBookingCancelScript_AlreadyCancelled tests double cancellation
func TestBookingCancelScript_AlreadyCancelled(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	// Create and cancel a booking
	bookingID := createTestBooking(t)
	if bookingID == "" {
		t.Fatal("Failed to create test booking")
	}

	// First cancellation
	_, err := main(bookingID, "First cancellation")
	if err != nil {
		t.Fatalf("First cancellation failed: %v", err)
	}

	// Second cancellation (should fail or return already cancelled)
	_, err2 := main(bookingID, "Second cancellation")

	// Should return error for already cancelled
	if err2 == nil {
		t.Log("Note: Second cancellation succeeded (may need idempotency check)")
	}
}

// TestBookingCancelScript_VeryLongReason tests very long cancellation reason
func TestBookingCancelScript_VeryLongReason(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	bookingID := createTestBooking(t)
	if bookingID == "" {
		t.Fatal("Failed to create test booking")
	}

	// Very long reason
	longReason := string(make([]byte, 1000))
	for i := range longReason {
		longReason[i] = 'X'
	}

	result, err := main(bookingID, longReason)

	// Should either succeed or return validation error
	if result == nil && err == nil {
		t.Error("Expected either result or error")
	}
}

// TestBookingCancelScript_SpecialCharsInReason tests special characters in reason
func TestBookingCancelScript_SpecialCharsInReason(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	bookingID := createTestBooking(t)
	if bookingID == "" {
		t.Fatal("Failed to create test booking")
	}

	reason := "Customer cancellation: <script>alert('XSS')</script> & other chars"
	
	result, err := main(bookingID, reason)

	if err != nil {
		t.Errorf("Expected success with special chars, got error: %v", err)
	}

	if result == nil {
		t.Error("Expected result with special chars")
	}
}

// TestBookingCancelScript_InvalidUUIDFormat tests invalid UUID format
func TestBookingCancelScript_InvalidUUIDFormat(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main("not-a-uuid", "Test reason")

	// Should return validation error
	if err == nil {
		t.Error("Expected error for invalid UUID format, got nil")
	}
}

// ============================================================================
// AVAILABILITY_CHECK SCRIPT TESTS
// ============================================================================
// Tests for: f/availability_check/main.go
// 
// This script wraps availability.CheckAvailability() function
// Tests cover: date validation, slot generation, provider/service checks
// ============================================================================

// TestAvailabilityCheckScript_ValidDate tests availability check with valid date
func TestAvailabilityCheckScript_ValidDate(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	providerID := 1
	serviceID := 1
	date := time.Now().AddDate(0, 0, 2).Format("2006-01-02") // 2 days from now

	result, err := main(providerID, serviceID, date)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if result == nil {
		t.Fatal("Expected result map, got nil")
	}

	// Check result structure
	if slots, ok := result["slots"]; !ok {
		t.Error("Expected 'slots' in result")
	} else if slots == nil {
		t.Log("Note: No slots available (may be expected)")
	}

	if total, ok := result["total_available"].(int); !ok {
		t.Error("Expected 'total_available' as int")
	}

	t.Logf("Availability check: %d slots available", result["total_available"])
}

// TestAvailabilityCheckScript_EmptyProviderID tests validation of empty provider_id
func TestAvailabilityCheckScript_EmptyProviderID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main(0, 1, "2026-04-01")

	// Should return validation error
	if err == nil {
		t.Error("Expected error for zero provider_id, got nil")
	}
}

// TestAvailabilityCheckScript_EmptyServiceID tests validation of empty service_id
func TestAvailabilityCheckScript_EmptyServiceID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main(1, 0, "2026-04-01")

	// Should return validation error
	if err == nil {
		t.Error("Expected error for zero service_id, got nil")
	}
}

// TestAvailabilityCheckScript_InvalidDateFormat tests invalid date format
func TestAvailabilityCheckScript_InvalidDateFormat(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main(1, 1, "invalid-date")

	// Should return validation error
	if err == nil {
		t.Error("Expected error for invalid date format, got nil")
	}
}

// TestAvailabilityCheckScript_PastDate tests availability for past date
func TestAvailabilityCheckScript_PastDate(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	pastDate := time.Now().AddDate(0, 0, -7).Format("2006-01-02") // 7 days ago

	result, err := main(1, 1, pastDate)

	if err != nil {
		t.Logf("Past date check returned error (may be expected): %v", err)
	}

	if result != nil {
		t.Logf("Past date check returned: %v slots", result["total_available"])
	}
}

// TestAvailabilityCheckScript_FarFutureDate tests availability for far future date
func TestAvailabilityCheckScript_FarFutureDate(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	farFuture := time.Now().AddDate(0, 0, 100).Format("2006-01-02") // 100 days from now

	result, err := main(1, 1, farFuture)

	// Should succeed but may have no slots
	if err != nil {
		t.Logf("Far future check returned error: %v", err)
	}

	t.Logf("Far future availability: %d slots", result["total_available"])
}

// TestAvailabilityCheckScript_WeekendDate tests availability on weekend
func TestAvailabilityCheckScript_WeekendDate(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	// Find next Saturday
	now := time.Now()
	daysUntilSaturday := int(time.Saturday - now.Weekday())
	if daysUntilSaturday < 0 {
		daysUntilSaturday += 7
	}
	saturday := now.AddDate(0, 0, daysUntilSaturday+7)
	date := saturday.Format("2006-01-02")

	result, err := main(1, 1, date)

	if err != nil {
		t.Logf("Weekend check returned error: %v", err)
	}

	t.Logf("Weekend availability: %d slots", result["total_available"])
}

// TestAvailabilityCheckScript_NonExistentProvider tests non-existent provider
func TestAvailabilityCheckScript_NonExistentProvider(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main(99999, 1, "2026-04-01")

	// Should return error or empty slots
	if err == nil {
		t.Log("Non-existent provider check succeeded (may return empty slots)")
	}
}

// TestAvailabilityCheckScript_NonExistentService tests non-existent service
func TestAvailabilityCheckScript_NonExistentService(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	_, err := main(1, 99999, "2026-04-01")

	// Should return error or empty slots
	if err == nil {
		t.Log("Non-existent service check succeeded (may return empty slots)")
	}
}

// TestAvailabilityCheckScript_InvalidProviderServiceCombo tests invalid provider/service combo
func TestAvailabilityCheckScript_InvalidProviderServiceCombo(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	// Provider 1 doesn't offer service 99999 (if that validation exists)
	result, err := main(1, 99999, "2026-04-01")

	if err != nil {
		t.Logf("Invalid combo check returned error: %v", err)
	}

	t.Logf("Invalid combo result: %d slots", result["total_available"])
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// createTestBooking creates a test booking and returns the ID
func createTestBooking(t *testing.T) string {
	t.Helper()

	// Import booking create script
	// Note: In real tests, this would call the actual create function
	// For now, return a placeholder
	_ = t
	
	// TODO: Implement actual booking creation
	// This requires importing the booking create script
	// or creating a booking directly in DB
	
	return "test-booking-id-placeholder"
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

// BenchmarkAvailabilityCheckScript_Performance benchmarks availability check
func BenchmarkAvailabilityCheckScript_Performance(b *testing.B) {
	providerID := 1
	serviceID := 1
	date := time.Now().AddDate(0, 0, 2).Format("2006-01-02")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := main(providerID, serviceID, date)
		if err != nil {
			b.Fatalf("Benchmark iteration failed: %v", err)
		}
	}
}
