package infrastructure

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestDistributedLock_AcquireValidation(t *testing.T) {
	// Missing ProviderID (zero)
	res := Acquire(0, "2026-06-16T15:00:00Z", nil, nil)
	if res.Success || res.ErrorCode == nil || (*res.ErrorCode != "INVALID_TYPE" && *res.ErrorCode != "INVALID_INPUT" && *res.ErrorCode != "MISSING_FIELD") {
		errStr := "nil"
		if res.ErrorCode != nil { errStr = *res.ErrorCode }
		t.Fatalf("Expected validation error for zero provider_id, got %v", errStr)
	}

	// Negative ProviderID
	res2 := Acquire(-5, "2026-06-16T15:00:00Z", nil, nil)
	if res2.Success || res2.ErrorCode == nil || (*res2.ErrorCode != "INVALID_TYPE" && *res2.ErrorCode != "INVALID_INPUT") {
		t.Fatalf("Expected validation error for negative provider_id")
	}

	// Missing StartTime
	res3 := Acquire(1, "", nil, nil)
	if res3.Success {
		t.Fatalf("Expected validation error for missing start time")
	}
}

func TestDistributedLock_AcquireIdempotency(t *testing.T) {
	token := fmt.Sprintf("owner_%d", time.Now().UnixNano())
	
	// First Acquire
	res1 := Acquire(777, "2026-10-10T10:00:00Z", ptr(5), &token)
	if !res1.Success {
		t.Fatalf("Failed to acquire lock properly: %v", *res1.ErrorMessage)
	}
	
	data1 := *res1.Data
	if !data1["acquired"].(bool) {
		t.Errorf("Expected initial lock acquisition to be true")
	}
	
	// Second Acquire (Idempotent update)
	res2 := Acquire(777, "2026-10-10T10:00:00Z", ptr(5), &token)
	if !res2.Success {
		t.Fatalf("Failed to execute secondary acquire: %v", *res2.ErrorMessage)
	}

	data2 := *res2.Data
	if data2["acquired"].(bool) {
		t.Errorf("Expected idempotency to technically return false (lock held) given current SQL mechanics")
	}

	// Competing Acquire (Should fail)
	otherToken := "competing_token"
	res3 := Acquire(777, "2026-10-10T10:00:00Z", ptr(5), &otherToken)
	if !res3.Success {
		t.Fatalf("Expected standard response for competing lock, got err: %v", *res3.ErrorMessage)
	}

	data3 := *res3.Data
	if data3["acquired"].(bool) {
		t.Errorf("Expected competing lock acquisition to fail")
	}

	// Cleanup
	Release(data1["lock_key"].(string), token)
}

func TestDistributedLock_ReleaseValidation(t *testing.T) {
	// Missing LockKey
	res1 := Release("", "owner")
	if res1.Success || *res1.ErrorCode != "MISSING_FIELD" {
		t.Fatalf("Expected validation to catch empty LockKey")
	}

	// Missing OwnerToken
	res2 := Release("some_lock_key", "")
	if res2.Success || *res2.ErrorCode != "MISSING_FIELD" {
		t.Fatalf("Expected validation to catch empty OwnerToken")
	}
	
	// Owner Token Mismatch / Lock not found
	res3 := Release("made_up_lock_key", "made_up_owner")
	if !res3.Success {
		t.Fatalf("Release should succeed operationally but yield released=false")
	}
	data3 := *res3.Data
	if data3["released"].(bool) {
		t.Errorf("Expected release to report false for fake keys")
	}
}

func TestDistributedLock_SecurityConstraints(t *testing.T) {
	// Simulating Injection (DB driver should handle escaping safely internally, this ensures no runtime panics)
	token := "'; DROP TABLE booking_locks; --"
	res := Acquire(999, "2026-12-12T12:00:00Z", ptr(5), &token)
	if !res.Success {
		t.Fatalf("Expected standard behavior digesting SQLi payloads safely: %v", *res.ErrorMessage)
	}

	data := *res.Data
	lockKey := data["lock_key"].(string)

	Release(lockKey, token) // cleanup

	// XSS
	tokenXSS := "<script>alert('xss')</script>"
	resXSS := Acquire(999, "2026-12-12T13:00:00Z", ptr(5), &tokenXSS)
	if !resXSS.Success {
		t.Fatalf("Expected standard behavior digesting XSS payloads safely")
	}
	
	dataXSS := *resXSS.Data
	Release(dataXSS["lock_key"].(string), tokenXSS) // cleanup

	// Long characters
	longToken := strings.Repeat("A", 300)
	resLong := Acquire(999, "2026-12-12T14:00:00Z", ptr(5), &longToken)
	if !resLong.Success {
		t.Fatalf("Expected standard behavior digesting long strings safely")
	}

	dataLong := *resLong.Data
	Release(dataLong["lock_key"].(string), longToken) // cleanup
}
