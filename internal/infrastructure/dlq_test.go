package infrastructure

import (
	"fmt"
	"testing"
	"time"

	"booking-titanium-wm/pkg/types"
)

func ptr[T any](v T) *T {
	return &v
}

func TestDLQ_Lifecycle(t *testing.T) {
	t.Run("Add entry to DLQ", func(t *testing.T) {
		idempotencyKey := fmt.Sprintf("test_dlq_%d", time.Now().UnixNano())
		req := types.DLQAddRequest{
			BookingID:      ptr(12345),
			ProviderID:     ptr(1),
			ServiceID:      ptr(1),
			FailureReason:  "API_ERROR",
			ErrorMessage:   "Connection timeout",
			IdempotencyKey: &idempotencyKey,
			OriginalPayload: map[string]interface{}{
				"test": "data",
			},
		}

		res := DLQAdd(req)
		if !res.Success {
			t.Fatalf("DLQAdd failed: %v", *res.ErrorMessage)
		}

		if res.Data.DLQID == 0 {
			t.Errorf("Expected non-zero DLQ ID")
		}
		if res.Data.IdempotencyKey != idempotencyKey {
			t.Errorf("Expected idempotency key %s, got %s", idempotencyKey, res.Data.IdempotencyKey)
		}
	})

	t.Run("Add entry with missing booking_id", func(t *testing.T) {
		req := types.DLQAddRequest{
			// BookingID explicitly omitted
			ProviderID:    ptr(1),
			ServiceID:     ptr(1),
			FailureReason: "ORPHAN_ERROR",
			ErrorMessage:  "No booking id",
		}

		res := DLQAdd(req)
		if !res.Success {
			t.Fatalf("DLQAdd failed for missing booking_id: %v", *res.ErrorMessage)
		}
	})

	t.Run("Get DLQ Status", func(t *testing.T) {
		res := DLQGetStatus()
		if !res.Success {
			t.Fatalf("DLQGetStatus failed: %v", *res.ErrorMessage)
		}

		status := res.Data
		if status.TotalItems < 1 {
			t.Errorf("Expected at least 1 item in DLQ total count")
		}
	})

	t.Run("Get DLQ Entries", func(t *testing.T) {
		res := DLQGetEntries("pending")
		if !res.Success {
			t.Fatalf("DLQGetEntries failed: %v", *res.ErrorMessage)
		}

		entries := res.Data
		if len(*entries) < 1 {
			t.Errorf("Expected at least 1 pending entry")
		}
	})
}
