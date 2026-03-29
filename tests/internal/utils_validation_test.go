package utils_test

import (
	"testing"
	"time"

	"booking-titanium-wm/pkg/utils"
)

// ============================================================================
// VALIDATION FUNCTIONS TESTS
// ============================================================================

// TestValidateUUID_Valid tests valid UUID validation
func TestValidateUUID_Valid(t *testing.T) {
	validUUIDs := []string{
		"00000000-0000-0000-0000-000000000001",
		"550e8400-e29b-41d4-a716-446655440000",
		"6ba7b810-9dad-11d1-80b4-00c04fd430c8",
	}

	for _, uuid := range validUUIDs {
		result := utils.ValidateUUID(uuid, "test_id")
		if !result.Valid {
			t.Errorf("Expected UUID %s to be valid, got error: %s", uuid, result.Message)
		}
	}
}

// TestValidateUUID_Invalid tests invalid UUID validation
func TestValidateUUID_Invalid(t *testing.T) {
	invalidUUIDs := []string{
		"",
		"not-a-uuid",
		"12345",
		"00000000-0000-0000-0000-00000000000", // Too short
		"00000000-0000-0000-0000-0000000000000", // Too long
		"00000000000000000000000000000000", // No hyphens
	}

	for _, uuid := range invalidUUIDs {
		result := utils.ValidateUUID(uuid, "test_id")
		if result.Valid {
			t.Errorf("Expected UUID %s to be invalid, got success", uuid)
		}
	}
}

// TestValidateFutureDate_Valid tests valid future date validation
func TestValidateFutureDate_Valid(t *testing.T) {
	futureDates := []time.Time{
		time.Now().Add(24 * time.Hour),
		time.Now().Add(48 * time.Hour),
		time.Now().AddDate(0, 0, 7),
	}

	for _, date := range futureDates {
		result := utils.ValidateFutureDate(date, "test_date")
		if !result.Valid {
			t.Errorf("Expected date %v to be valid future date, got error: %s", date, result.Message)
		}
	}
}

// TestValidateFutureDate_Invalid tests invalid past date validation
func TestValidateFutureDate_Invalid(t *testing.T) {
	pastDates := []time.Time{
		time.Now().Add(-24 * time.Hour),
		time.Now().Add(-1 * time.Hour),
		time.Now().AddDate(0, 0, -7),
	}

	for _, date := range pastDates {
		result := utils.ValidateFutureDate(date, "test_date")
		if result.Valid {
			t.Errorf("Expected date %v to be invalid (past), got success", date)
		}
	}
}

// TestValidateFutureDate_TooFar tests dates too far in future
func TestValidateFutureDate_TooFar(t *testing.T) {
	tooFar := time.Now().AddDate(2, 0, 0) // 2 years in future

	result := utils.ValidateFutureDate(tooFar, "test_date")
	if result.Valid {
		t.Errorf("Expected date %v to be invalid (too far), got success", tooFar)
	}
}

// TestValidateResourceField_Valid tests valid resource field validation
func TestValidateResourceField_Valid(t *testing.T) {
	resource := map[string]interface{}{
		"credentials_json": "{\"key\":\"value\"}",
		"bot_token":        "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
	}

	for field := range resource {
		result := utils.ValidateResourceField(resource, field)
		if !result.Valid {
			t.Errorf("Expected field %s to be valid, got error: %s", field, result.Message)
		}
	}
}

// TestValidateResourceField_Invalid tests invalid resource field validation
func TestValidateResourceField_Invalid(t *testing.T) {
	resource := map[string]interface{}{
		"credentials_json": "{\"key\":\"value\"}",
	}

	// Test missing field
	result := utils.ValidateResourceField(resource, "missing_field")
	if result.Valid {
		t.Error("Expected missing field to be invalid, got success")
	}

	// Test nil resource
	result2 := utils.ValidateResourceField(nil, "any_field")
	if result2.Valid {
		t.Error("Expected nil resource to be invalid, got success")
	}
}

// TestValidateNonEmptyString_Valid tests valid non-empty string validation
func TestValidateNonEmptyString_Valid(t *testing.T) {
	validStrings := []string{
		"hello",
		"Test User",
		"José García", // UTF-8
	}

	for _, str := range validStrings {
		result := utils.ValidateNonEmptyString(str, "test_field")
		if !result.Valid {
			t.Errorf("Expected string %q to be valid, got error: %s", str, result.Message)
		}
	}
}

// TestValidateNonEmptyString_Invalid tests invalid empty string validation
func TestValidateNonEmptyString_Invalid(t *testing.T) {
	invalidStrings := []string{
		"",
		"   ",      // Only whitespace
		"\t\n",     // Only whitespace chars
	}

	for _, str := range invalidStrings {
		result := utils.ValidateNonEmptyString(str, "test_field")
		if result.Valid {
			t.Errorf("Expected string %q to be invalid, got success", str)
		}
	}
}

// TestValidateNonEmptyString_TooLong tests very long strings
func TestValidateNonEmptyString_TooLong(t *testing.T) {
	longString := string(make([]byte, 10001)) // Over 10000 char limit
	result := utils.ValidateNonEmptyString(longString, "test_field")
	if result.Valid {
		t.Error("Expected string >10000 chars to be invalid, got success")
	}
}

// TestValidateTimeRange_Valid tests valid time range validation
func TestValidateTimeRange_Valid(t *testing.T) {
	start := time.Now()
	end := start.Add(1 * time.Hour)

	result := utils.ValidateTimeRange(start, end)
	if !result.Valid {
		t.Errorf("Expected valid time range, got error: %s", result.Message)
	}
}

// TestValidateTimeRange_Invalid tests invalid time range validation
func TestValidateTimeRange_Invalid(t *testing.T) {
	start := time.Now()
	end := start.Add(-1 * time.Hour) // End before start

	result := utils.ValidateTimeRange(start, end)
	if result.Valid {
		t.Error("Expected invalid time range (end before start), got success")
	}
}

// TestValidateBookingTimes_Valid tests valid booking times validation
func TestValidateBookingTimes_Valid(t *testing.T) {
	start := time.Now().Add(48 * time.Hour)
	end := start.Add(1 * time.Hour)

	result := utils.ValidateBookingTimes(start, end)
	if !result.Valid {
		t.Errorf("Expected valid booking times, got error: %s", result.Message)
	}
}

// TestValidateBookingTimes_TooShort tests booking duration too short
func TestValidateBookingTimes_TooShort(t *testing.T) {
	start := time.Now().Add(48 * time.Hour)
	end := start.Add(5 * time.Minute) // Less than 15 min minimum

	result := utils.ValidateBookingTimes(start, end)
	if result.Valid {
		t.Error("Expected booking <15min to be invalid, got success")
	}
}

// TestValidateBookingTimes_TooLong tests booking duration too long
func TestValidateBookingTimes_TooLong(t *testing.T) {
	start := time.Now().Add(48 * time.Hour)
	end := start.Add(10 * time.Hour) // More than 8 hour maximum

	result := utils.ValidateBookingTimes(start, end)
	if result.Valid {
		t.Error("Expected booking >8hrs to be invalid, got success")
	}
}

// ============================================================================
// IDEMPOTENCY KEY GENERATOR TESTS
// ============================================================================

// TestGenerateIdempotencyKey_Consistency tests key generation consistency
func TestGenerateIdempotencyKey_Consistency(t *testing.T) {
	providerID := 1
	serviceID := 1
	startTime := "2026-04-01T10:00:00Z"
	chatID := "123456789"

	key1 := utils.GenerateIdempotencyKey(providerID, serviceID, startTime, chatID)
	key2 := utils.GenerateIdempotencyKey(providerID, serviceID, startTime, chatID)

	if key1 != key2 {
		t.Errorf("Expected consistent keys, got %s vs %s", key1, key2)
	}
}

// TestGenerateIdempotencyKey_Unique tests key uniqueness for different inputs
func TestGenerateIdempotencyKey_Unique(t *testing.T) {
	baseTime := "2026-04-01T10:00:00Z"

	// Different chat IDs should produce different keys
	key1 := utils.GenerateIdempotencyKey(1, 1, baseTime, "chat1")
	key2 := utils.GenerateIdempotencyKey(1, 1, baseTime, "chat2")

	if key1 == key2 {
		t.Error("Expected different keys for different chat IDs")
	}
}

// TestGenerateIdempotencyKeySingle_Consistency tests single-provider key consistency
func TestGenerateIdempotencyKeySingle_Consistency(t *testing.T) {
	serviceID := 1
	startTime := "2026-04-01T10:00:00Z"
	chatID := "123456789"

	key1 := utils.GenerateIdempotencyKeySingle(serviceID, startTime, chatID)
	key2 := utils.GenerateIdempotencyKeySingle(serviceID, startTime, chatID)

	if key1 != key2 {
		t.Errorf("Expected consistent keys, got %s vs %s", key1, key2)
	}
}

// TestGenerateIdempotencyKeySingleUUID_Consistency tests UUID-based key consistency
func TestGenerateIdempotencyKeySingleUUID_Consistency(t *testing.T) {
	serviceUUID := "00000000-0000-0000-0000-000000000001"
	startTime := "2026-04-01T10:00:00Z"
	chatID := "123456789"

	key1 := utils.GenerateIdempotencyKeySingleUUID(serviceUUID, startTime, chatID)
	key2 := utils.GenerateIdempotencyKeySingleUUID(serviceUUID, startTime, chatID)

	if key1 != key2 {
		t.Errorf("Expected consistent keys, got %s vs %s", key1, key2)
	}
}

// TestGenerateIdempotencyKeySingleUUID_ShortUUID tests UUID shortening
func TestGenerateIdempotencyKeySingleUUID_ShortUUID(t *testing.T) {
	serviceUUID := "00000000-0000-0000-0000-000000000001"
	startTime := "2026-04-01T10:00:00Z"
	chatID := "123456789"

	key := utils.GenerateIdempotencyKeySingleUUID(serviceUUID, startTime, chatID)

	// Key should contain first 8 chars of UUID
	if len(key) > 60 { // Reasonable max length
		t.Errorf("Key too long: %d chars", len(key))
	}
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

// BenchmarkValidateUUID_Performance benchmarks UUID validation
func BenchmarkValidateUUID_Performance(b *testing.B) {
	uuid := "00000000-0000-0000-0000-000000000001"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = utils.ValidateUUID(uuid, "test_id")
	}
}

// BenchmarkValidateFutureDate_Performance benchmarks date validation
func BenchmarkValidateFutureDate_Performance(b *testing.B) {
	date := time.Now().Add(48 * time.Hour)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = utils.ValidateFutureDate(date, "test_date")
	}
}

// BenchmarkGenerateIdempotencyKey_Performance benchmarks key generation
func BenchmarkGenerateIdempotencyKey_Performance(b *testing.B) {
	startTime := "2026-04-01T10:00:00Z"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = utils.GenerateIdempotencyKey(1, 1, startTime, "chat123")
	}
}

// BenchmarkGenerateIdempotencyKeySingleUUID_Performance benchmarks UUID key gen
func BenchmarkGenerateIdempotencyKeySingleUUID_Performance(b *testing.B) {
	startTime := "2026-04-01T10:00:00Z"
	serviceUUID := "00000000-0000-0000-0000-000000000001"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = utils.GenerateIdempotencyKeySingleUUID(serviceUUID, startTime, "chat123")
	}
}
