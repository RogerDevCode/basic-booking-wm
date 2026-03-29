package utils_test

import (
	"testing"
	"time"

	"booking-titanium-wm/pkg/utils"
)

// ============================================================================
// UUID VALIDATION TESTS
// ============================================================================

func TestValidateUUID_Valid(t *testing.T) {
	validUUIDs := []string{
		"00000000-0000-0000-0000-000000000001",
		"550e8400-e29b-41d4-a716-446655440000",
		"6ba7b810-9dad-11d1-80b4-00c04fd430c8",
	}

	for _, uuid := range validUUIDs {
		result := utils.ValidateUUID(uuid, "test_id")
		if !result.Valid {
			t.Errorf("Expected UUID %s to be valid, got: %s", uuid, result.Message)
		}
	}
}

func TestValidateUUID_Invalid(t *testing.T) {
	invalidUUIDs := []string{
		"",
		"not-a-uuid",
		"12345",
		"00000000-0000-0000-0000-00000000000",
	}

	for _, uuid := range invalidUUIDs {
		result := utils.ValidateUUID(uuid, "test_id")
		if result.Valid {
			t.Errorf("Expected UUID %s to be invalid", uuid)
		}
	}
}

// ============================================================================
// FUTURE DATE VALIDATION TESTS
// ============================================================================

func TestValidateFutureDate_Valid(t *testing.T) {
	future := time.Now().Add(24 * time.Hour)
	result := utils.ValidateFutureDate(future, "test_date")
	if !result.Valid {
		t.Errorf("Expected future date to be valid, got: %s", result.Message)
	}
}

func TestValidateFutureDate_Past(t *testing.T) {
	past := time.Now().Add(-24 * time.Hour)
	result := utils.ValidateFutureDate(past, "test_date")
	if result.Valid {
		t.Error("Expected past date to be invalid")
	}
}

// ============================================================================
// IDEMPOTENCY KEY TESTS
// ============================================================================

func TestGenerateIdempotencyKey_Consistent(t *testing.T) {
	key1 := utils.GenerateIdempotencyKey("1", "1", "2026-04-01T10:00:00Z", "chat1")
	key2 := utils.GenerateIdempotencyKey("1", "1", "2026-04-01T10:00:00Z", "chat1")
	
	if key1 != key2 {
		t.Errorf("Expected consistent keys, got %s vs %s", key1, key2)
	}
}

func TestGenerateIdempotencyKey_Unique(t *testing.T) {
	key1 := utils.GenerateIdempotencyKey("1", "1", "2026-04-01T10:00:00Z", "chat1")
	key2 := utils.GenerateIdempotencyKey("1", "1", "2026-04-01T10:00:00Z", "chat2")
	
	if key1 == key2 {
		t.Error("Expected different keys for different chat IDs")
	}
}

func TestGenerateIdempotencyKeySingleUUID_Consistent(t *testing.T) {
	uuid := "00000000-0000-0000-0000-000000000001"
	key1 := utils.GenerateIdempotencyKeySingleUUID(uuid, "2026-04-01T10:00:00Z", "chat1")
	key2 := utils.GenerateIdempotencyKeySingleUUID(uuid, "2026-04-01T10:00:00Z", "chat1")
	
	if key1 != key2 {
		t.Errorf("Expected consistent keys, got %s vs %s", key1, key2)
	}
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

func BenchmarkValidateUUID(b *testing.B) {
	uuid := "00000000-0000-0000-0000-000000000001"
	for i := 0; i < b.N; i++ {
		_ = utils.ValidateUUID(uuid, "test_id")
	}
}

func BenchmarkGenerateIdempotencyKey(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = utils.GenerateIdempotencyKey("1", "1", "2026-04-01T10:00:00Z", "chat123")
	}
}

func BenchmarkGenerateIdempotencyKeySingleUUID(b *testing.B) {
	uuid := "00000000-0000-0000-0000-000000000001"
	for i := 0; i < b.N; i++ {
		_ = utils.GenerateIdempotencyKeySingleUUID(uuid, "2026-04-01T10:00:00Z", "chat123")
	}
}
