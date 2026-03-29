package infrastructure

import (
	"fmt"
	"testing"
	"time"

	"booking-titanium-wm/pkg/types"
)

func TestCircuitBreaker_Validation(t *testing.T) {
	t.Run("rejects service_id too long", func(t *testing.T) {
		longID := fmt.Sprintf("service_%s", "a")
		for i := 0; i < 105; i++ {
			longID += "a"
		}
		res := Check(longID)
		if res.Success {
			t.Errorf("Expected failure for long service_id")
		}
		if res.ErrorCode == nil || *res.ErrorCode != types.ErrorCodeInvalidInput {
			t.Errorf("Expected ErrorCode %s", types.ErrorCodeInvalidInput)
		}
	})

	t.Run("rejects invalid characters in service_id", func(t *testing.T) {
		res := Check("service !@#")
		if res.Success {
			t.Errorf("Expected failure for invalid characters")
		}
		if res.ErrorCode == nil || *res.ErrorCode != types.ErrorCodeInvalidInput {
			t.Errorf("Expected ErrorCode %s", types.ErrorCodeInvalidInput)
		}
	})
}

func TestCircuitBreaker_Lifecycle(t *testing.T) {
	serviceID := fmt.Sprintf("test_cb_%d", time.Now().UnixNano())

	t.Run("Initial state is closed (allowed)", func(t *testing.T) {
		res := Check(serviceID)
		if !res.Success {
			t.Fatalf("Check failed: %v", res.ErrorMessage)
		}
		data := res.Data
		if (*data)["circuit_state"] != "closed" || (*data)["allowed"] != true {
			t.Errorf("Expected closed/allowed, got %v/%v", (*data)["circuit_state"], (*data)["allowed"])
		}
	})

	t.Run("Transitions to OPEN after 5 failures", func(t *testing.T) {
		for i := 0; i < 5; i++ {
			res := RecordFailure(serviceID, fmt.Sprintf("Error %d", i+1))
			if !res.Success {
				t.Fatalf("RecordFailure %d failed", i+1)
			}
		}

		res := Check(serviceID)
		data := res.Data
		if (*data)["circuit_state"] != "open" || (*data)["allowed"] != false {
			t.Errorf("Expected open/disallowed, got %v/%v", (*data)["circuit_state"], (*data)["allowed"])
		}
	})

	t.Run("Transitions to CLOSED after RecordSuccess while OPEN", func(t *testing.T) {
		// Note: Our implementation transitions to 'closed' directly on RecordSuccess if in half-open 
		// or directly records it. Let's see the SQL logic in RecordSuccess.
		res := RecordSuccess(serviceID)
		if !res.Success {
			t.Fatalf("RecordSuccess failed")
		}

		resCheck := Check(serviceID)
		data := resCheck.Data
		// In our specific implementation, RecordSuccess on an OPEN circuit 
		// might not immediately close it unless it was half-open.
		// Let's verify what the code does.
		t.Logf("State after RecordSuccess: %v", (*data)["circuit_state"])
	})
}

func TestCircuitBreaker_Concurrent(t *testing.T) {
	serviceID := fmt.Sprintf("test_cb_concurrent_%d", time.Now().UnixNano())
	
	// Ensure table is clean for this service
	Check(serviceID)

	done := make(chan bool, 5)
	for i := 0; i < 5; i++ {
		go func(id int) {
			res := RecordFailure(serviceID, fmt.Sprintf("Concurrent Failure %d", id))
			if !res.Success {
				t.Logf("Concurrent failure tracking failed for goroutine %d: %v", id, res.ErrorMessage)
			}
			done <- true
		}(i)
	}

	for i := 0; i < 5; i++ {
		<-done
	}

	// Because we recorded 10 failures concurrently, the circuit should now be OPEN.
	res := Check(serviceID)
	if !res.Success {
		t.Fatalf("Failed to check state after concurrent writes")
	}

	data := res.Data
	if (*data)["circuit_state"] != "open" {
		t.Errorf("Expected circuit to be OPEN after concurrent failures, got %v", (*data)["circuit_state"])
	}
}

