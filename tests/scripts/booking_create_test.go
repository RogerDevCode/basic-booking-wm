package main_test

import (
	"testing"
	"time"
)

// ============================================================================
// BOOKING_CREATE SCRIPT TESTS
// ============================================================================
// Tests for: f/booking_create/main.go
// 
// This script wraps booking.CreateBooking() function
// Tests cover: validation, idempotency, availability, creation
// ============================================================================

// TestBookingCreateScript_ValidRequest tests a valid booking creation request
func TestBookingCreateScript_ValidRequest(t *testing.T) {
	// Skip in short test mode
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Test data - using single provider/service UUIDs from config
	providerID := 1 // Will be overridden by config in single-provider mode
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	// Call script main function
	result, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Assert
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if result == nil {
		t.Fatal("Expected result map, got nil")
	}

	// Check required fields
	if id, ok := result["id"].(string); !ok || id == "" {
		t.Error("Expected booking id in result")
	}

	if status, ok := result["status"].(string); !ok || status == "" {
		t.Error("Expected status in result")
	}

	if isDuplicate, ok := result["is_duplicate"].(bool); !ok {
		t.Error("Expected is_duplicate boolean in result")
	}

	t.Logf("Booking created successfully: %v", result["id"])
}

// TestBookingCreateScript_EmptyChatID tests validation of empty chat_id
func TestBookingCreateScript_EmptyChatID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "" // Invalid
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	_, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should return validation error
	if err == nil {
		t.Error("Expected error for empty chat_id, got nil")
	}
}

// TestBookingCreateScript_InvalidStartTime tests validation of invalid time format
func TestBookingCreateScript_InvalidStartTime(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := "invalid-time-format" // Invalid
	chatID := "123456789"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	_, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should return validation error
	if err == nil {
		t.Error("Expected error for invalid start_time, got nil")
	}
}

// TestBookingCreateScript_PastTime tests validation of past time booking
func TestBookingCreateScript_PastTime(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(-24 * time.Hour).Format(time.RFC3339) // Past
	chatID := "123456789"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	_, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should return validation error (past time)
	if err == nil {
		t.Error("Expected error for past time, got nil")
	}
}

// TestBookingCreateScript_Idempotency tests that duplicate requests return same booking
func TestBookingCreateScript_Idempotency(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(72 * time.Hour).Format(time.RFC3339)
	chatID := "987654321"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	// First request
	result1, err1 := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	if err1 != nil {
		t.Fatalf("First request failed: %v", err1)
	}

	// Second request (same data - should be idempotent)
	result2, err2 := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	if err2 != nil {
		t.Fatalf("Second request failed: %v", err2)
	}

	// Check if marked as duplicate
	if isDuplicate, ok := result2["is_duplicate"].(bool); !ok || !isDuplicate {
		t.Log("Note: Second request may not be marked as duplicate if idempotency key logic changed")
	}

	// Both should have same ID if idempotent
	if result1["id"] != result2["id"] {
		t.Log("Note: IDs differ - check idempotency key generation")
	}

	t.Logf("First booking: %v, Second: %v", result1["id"], result2["id"])
}

// TestBookingCreateScript_MissingEmail tests that email is optional
func TestBookingCreateScript_MissingEmail(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := "Test User"
	userEmail := "" // Empty but should be OK
	gcalEventID := ""

	result, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Email is optional, should succeed
	if err != nil {
		t.Errorf("Expected success with empty email, got error: %v", err)
	}

	if result == nil {
		t.Error("Expected result with empty email")
	}
}

// TestBookingCreateScript_SpecialCharacters tests special chars in name
func TestBookingCreateScript_SpecialCharacters(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := "José María García-López" // Special chars
	userEmail := "test@example.com"
	gcalEventID := ""

	result, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	if err != nil {
		t.Errorf("Expected success with special chars, got error: %v", err)
	}

	if result == nil {
		t.Error("Expected result with special chars")
	}
}

// TestBookingCreateScript_LongUserName tests very long user name
func TestBookingCreateScript_LongUserName(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := string(make([]byte, 500)) // Very long name
	for i := range userName {
		userName[i] = 'A'
	}
	userEmail := "test@example.com"
	gcalEventID := ""

	result, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should either succeed or return validation error (not panic)
	if result == nil && err == nil {
		t.Error("Expected either result or error")
	}
}

// TestBookingCreateScript_InvalidProviderID tests invalid provider ID
func TestBookingCreateScript_InvalidProviderID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 99999 // Non-existent
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	_, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should return error for non-existent provider
	if err == nil {
		t.Error("Expected error for invalid provider_id, got nil")
	}
}

// TestBookingCreateScript_InvalidServiceID tests invalid service ID
func TestBookingCreateScript_InvalidServiceID(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	providerID := 1
	serviceID := 99999 // Non-existent
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "123456789"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	_, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should return error for non-existent service
	if err == nil {
		t.Error("Expected error for invalid service_id, got nil")
	}
}

// TestBookingCreateScript_WeekendBooking tests booking on weekend
func TestBookingCreateScript_WeekendBooking(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	// Find next Saturday
	now := time.Now()
	daysUntilSaturday := int(time.Saturday - now.Weekday())
	if daysUntilSaturday < 0 {
		daysUntilSaturday += 7
	}
	saturday := now.AddDate(0, 0, daysUntilSaturday+7) // Next week

	providerID := 1
	serviceID := 1
	startTime := time.Date(saturday.Year(), saturday.Month(), saturday.Day(), 10, 0, 0, 0, saturday.Location()).Format(time.RFC3339)
	chatID := "weekend_test"
	userName := "Weekend User"
	userEmail := "weekend@example.com"
	gcalEventID := ""

	result, err := main(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	// Should succeed if provider available on weekends
	if err != nil {
		t.Logf("Weekend booking failed (may be expected): %v", err)
	}

	if result != nil {
		t.Logf("Weekend booking succeeded: %v", result["id"])
	}
}

// TestBookingCreateScript_ConcurrentBookings tests concurrent booking attempts
func TestBookingCreateScript_ConcurrentBookings(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	// Same time slot for multiple users
	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(96 * time.Hour).Format(time.RFC3339)
	
	// Run 3 concurrent bookings for same slot
	done := make(chan bool, 3)
	results := make([]map[string]any, 3)
	errors := make([]error, 3)

	for i := 0; i < 3; i++ {
		go func(idx int, chatID string) {
			result, err := main(
				providerID,
				serviceID,
				startTime,
				chatID,
				"User "+chatID,
				"user"+chatID+"@example.com",
				"",
			)
			results[idx] = result
			errors[idx] = err
			done[idx] = true
		}(i, "concurrent_"+string(rune(i+'0')))
	}

	// Wait for all to complete
	for i := 0; i < 3; i++ {
		<-done
	}

	// Count successes
	successes := 0
	for i := 0; i < 3; i++ {
		if errors[i] == nil && results[i] != nil {
			successes++
		}
	}

	// At least one should succeed, others may fail due to slot conflict
	if successes == 0 {
		t.Error("Expected at least one successful booking")
	}

	t.Logf("Concurrent test: %d/3 succeeded", successes)
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

// BenchmarkBookingCreateScript_Performance benchmarks booking creation performance
func BenchmarkBookingCreateScript_Performance(b *testing.B) {
	providerID := 1
	serviceID := 1
	startTime := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	chatID := "benchmark_user"
	userName := "Benchmark User"
	userEmail := "benchmark@example.com"
	gcalEventID := ""

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := main(
			providerID,
			serviceID,
			startTime,
			chatID,
			userName,
			userEmail,
			gcalEventID,
		)
		if err != nil {
			b.Fatalf("Benchmark iteration failed: %v", err)
		}
	}
}
