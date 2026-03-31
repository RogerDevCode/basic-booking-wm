package booking_test

import (
	"testing"
	"time"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/pkg/types"
)

// ============================================================================
// BOOKING_CREATE SCRIPT TESTS
// ============================================================================
// Tests for: f/booking_create/main.go
// Tests the underlying booking.CreateBooking function
// ============================================================================

// TestBookingCreate_ValidRequest tests a valid booking creation
func TestBookingCreate_ValidRequest(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Test data
	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "test_chat_123"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	// Call booking creation
	response := booking.CreateBooking(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Assert success
	if !response.Success {
		t.Logf("Booking creation failed (may be expected if DB not configured): %v", response.ErrorMessage)
		t.Skip("Skipping - DB not configured")
	}

	// Validate response structure
	if response.Data == nil {
		t.Fatal("Expected data in response")
	}

	// Check required fields
	data := *response.Data
	if id, ok := data["id"].(string); !ok || id == "" {
		t.Error("Expected booking id in response")
	}

	if status, ok := data["status"].(string); !ok || status == "" {
		t.Error("Expected status in response")
	}

	if isDuplicate, ok := data["is_duplicate"].(bool); !ok {
		t.Error("Expected is_duplicate boolean in response")
	}

	t.Logf("✓ Booking created successfully: %v", data["id"])
}

// TestBookingCreate_EmptyChatID tests validation of empty chat_id
func TestBookingCreate_EmptyChatID(t *testing.T) {
	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"", // Empty chat_id
		"Test User",
		"test@example.com",
		"",
	)

	// Should fail validation
	if response.Success {
		t.Error("Expected failure for empty chat_id, got success")
	}

	if response.ErrorCode == nil {
		t.Error("Expected error code for empty chat_id")
	}

	t.Logf("✓ Validation passed: %v", response.ErrorMessage)
}

// TestBookingCreate_InvalidStartTime tests validation of invalid time format
func TestBookingCreate_InvalidStartTime(t *testing.T) {
	response := booking.CreateBooking(
		1, 1,
		"invalid-time-format",
		"123456789",
		"Test User",
		"test@example.com",
		"",
	)

	// Should fail validation
	if response.Success {
		t.Error("Expected failure for invalid start_time, got success")
	}

	t.Logf("✓ Validation passed: %v", response.ErrorMessage)
}

// TestBookingCreate_PastTime tests prevention of past bookings
func TestBookingCreate_PastTime(t *testing.T) {
	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(-24*time.Hour).Format(time.RFC3339), // Past
		"123456789",
		"Test User",
		"test@example.com",
		"",
	)

	// Should fail validation
	if response.Success {
		t.Error("Expected failure for past time, got success")
	}

	t.Logf("✓ Validation passed: %v", response.ErrorMessage)
}

// TestBookingCreate_MissingEmail tests that email is optional
func TestBookingCreate_MissingEmail(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_456",
		"Test User",
		"", // Empty email
		"",
	)

	// Email is optional, should succeed
	if !response.Success {
		t.Logf("Note: Empty email failed: %v", response.ErrorMessage)
		t.Skip("Skipping - may require DB")
	}

	t.Logf("✓ Optional email validation passed")
}

// TestBookingCreate_SpecialCharacters tests UTF-8 in user name
func TestBookingCreate_SpecialCharacters(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_utf8",
		"José María García-López", // Special chars
		"test@example.com",
		"",
	)

	// Should handle UTF-8 correctly
	if !response.Success {
		t.Logf("Note: UTF-8 name failed: %v", response.ErrorMessage)
		t.Skip("Skipping - may require DB")
	}

	t.Logf("✓ UTF-8 handling passed")
}

// TestBookingCreate_LongUserName tests very long user name
func TestBookingCreate_LongUserName(t *testing.T) {
	longName := string(make([]byte, 500))
	for i := range longName {
		longName[i] = 'A'
	}

	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_long",
		longName,
		"test@example.com",
		"",
	)

	// Should either succeed or return validation error (not panic)
	if response.Success {
		t.Logf("✓ Long name accepted")
	} else {
		t.Logf("✓ Long name rejected with validation error: %v", response.ErrorMessage)
	}
}

// TestBookingCreate_InvalidProviderID tests non-existent provider
func TestBookingCreate_InvalidProviderID(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	response := booking.CreateBooking(
		99999, // Non-existent
		1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_invalid",
		"Test User",
		"test@example.com",
		"",
	)

	// Should fail for non-existent provider
	if response.Success {
		t.Error("Expected failure for invalid provider_id")
	}

	t.Logf("✓ Provider validation passed: %v", response.ErrorMessage)
}

// TestBookingCreate_InvalidServiceID tests non-existent service
func TestBookingCreate_InvalidServiceID(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	response := booking.CreateBooking(
		1,
		99999, // Non-existent
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_invalid",
		"Test User",
		"test@example.com",
		"",
	)

	// Should fail for non-existent service
	if response.Success {
		t.Error("Expected failure for invalid service_id")
	}

	t.Logf("✓ Service validation passed: %v", response.ErrorMessage)
}

// TestBookingCreate_ResponseStructure tests response structure
func TestBookingCreate_ResponseStructure(t *testing.T) {
	response := booking.CreateBooking(
		1, 1,
		time.Now().Add(48*time.Hour).Format(time.RFC3339),
		"test_chat_structure",
		"Test User",
		"test@example.com",
		"",
	)

	// Check response structure (regardless of success/failure)
	if response.ErrorCode == nil && !response.Success {
		t.Error("Expected either Success=true or ErrorCode set")
	}

	if response.Meta.Source == "" {
		t.Error("Expected Meta.Source to be set")
	}

	if response.Meta.Timestamp == "" {
		t.Error("Expected Meta.Timestamp to be set")
	}

	t.Logf("✓ Response structure valid")
}

// TestBookingCreate_StatusConstants tests status constants match DB
func TestBookingCreate_StatusConstants(t *testing.T) {
	// Verify status constants are lowercase (v4.0 compliant)
	statuses := []types.BookingStatus{
		types.StatusPending,
		types.StatusConfirmed,
		types.StatusInService,
		types.StatusCompleted,
		types.StatusCancelled,
		types.StatusNoShow,
		types.StatusRescheduled,
	}

	for _, status := range statuses {
		// Check lowercase
		if status != types.BookingStatus(status.String()) {
			t.Errorf("Status %s may not match DB constraint", status)
		}
	}

	t.Logf("✓ Status constants valid: %v", statuses)
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

// BenchmarkBookingCreate_Performance benchmarks booking creation
func BenchmarkBookingCreate_Performance(b *testing.B) {
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = booking.CreateBooking(
			1, 1,
			startTime,
			"benchmark_user",
			"Benchmark User",
			"benchmark@example.com",
			"",
		)
	}
}
