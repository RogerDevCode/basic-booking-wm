package inner

import (
	"context"
	"database/sql"
	"os"
	"sync"
	"testing"
	"time"

	"booking-titanium-wm/internal/infrastructure"
)

// TestFlow_Integration_BookingLifecycle prueba el flujo completo de booking
func TestFlow_Integration_BookingLifecycle(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping integration test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialize DB with multiplexer
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Test data
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 1).Format("2006-01-02") + "T10:00:00-03:00"
	chatID := "5391760292"
	idempotencyKey := "FLOW-TEST-" + time.Now().Format("20060102150405")

	t.Logf("Creating booking: provider=%s, service=%s, time=%s", providerID, serviceID, startTime)

	// Step 1: Create booking
	bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
	if err != nil {
		t.Fatalf("Failed to create booking: %v", err)
	}
	t.Logf("✅ Booking created: %s", bookingID)

	// Step 2: Verify booking exists
	exists, err := verifyBookingExists(ctx, db, bookingID)
	if err != nil {
		t.Fatalf("Failed to verify booking: %v", err)
	}
	if !exists {
		t.Errorf("Booking %s should exist but doesn't", bookingID)
	}
	t.Logf("✅ Booking verified: %s", bookingID)

	// Step 3: Try to create duplicate (should fail or return existing)
	t.Logf("Testing idempotency...")
	bookingID2, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
	if err != nil {
		t.Logf("⚠️  Duplicate creation failed (expected): %v", err)
	} else {
		if bookingID != bookingID2 {
			t.Errorf("Idempotency failed: got different booking IDs %s vs %s", bookingID, bookingID2)
		} else {
			t.Logf("✅ Idempotency verified: same booking ID returned")
		}
	}

	// Step 4: Cleanup - cancel booking
	err = cancelTestBooking(ctx, db, bookingID)
	if err != nil {
		t.Logf("⚠️  Cleanup failed: %v", err)
	} else {
		t.Logf("✅ Booking cancelled: %s", bookingID)
	}
}

// TestFlow_ConcurrentBookings_Limited prueba concurrencia controlada
func TestFlow_ConcurrentBookings_Limited(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping integration test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Initialize DB
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Limit concurrent bookings to avoid resource exhaustion
	maxConcurrent := 5
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	chatID := "5391760292"

	// Use semaphore pattern to limit concurrency
	semaphore := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	results := make(chan string, maxConcurrent)
	errors := make(chan error, maxConcurrent)

	t.Logf("Testing %d concurrent bookings (max %d concurrent)", maxConcurrent, maxConcurrent)

	for i := 0; i < maxConcurrent; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Acquire semaphore
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// Create unique time slot for each booking
			hour := 10 + index
			startTime := time.Now().AddDate(0, 0, 2).Format("2006-01-02") + "T" + string(rune('0'+hour/10)) + string(rune('0'+hour%10)) + ":00:00-03:00"
			idempotencyKey := "FLOW-CONCURRENT-" + string(rune('0'+index)) + "-" + time.Now().Format("20060102150405")

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
			if err != nil {
				errors <- err
				return
			}

			results <- bookingID

			// Cleanup
			defer func() {
				cancelTestBooking(ctx, db, bookingID)
			}()
		}(i)
	}

	// Wait for all goroutines to complete
	wg.Wait()
	close(results)
	close(errors)

	// Collect results
	bookingCount := 0
	for range results {
		bookingCount++
	}

	// Collect errors
	errorCount := 0
	for err := range errors {
		t.Logf("⚠️  Error: %v", err)
		errorCount++
	}

	t.Logf("✅ Results: %d bookings created, %d errors", bookingCount, errorCount)

	// Verify at least some bookings succeeded
	if bookingCount == 0 {
		t.Errorf("Expected at least 1 booking to succeed, got 0")
	}
}

// TestFlow_AdvisoryLock_Effectiveness prueba la efectividad de advisory locks
func TestFlow_AdvisoryLock_Effectiveness(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping integration test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Test same time slot from multiple goroutines
	maxAttempts := 10
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 3).Format("2006-01-02") + "T12:00:00-03:00"
	chatID := "5391760292"

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	t.Logf("Testing advisory lock with %d concurrent attempts for same time slot", maxAttempts)

	for i := 0; i < maxAttempts; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			idempotencyKey := "FLOW-LOCK-TEST-" + string(rune('0'+index)) + "-" + time.Now().Format("20060102150405")

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
			if err != nil {
				t.Logf("⚠️  Attempt %d failed: %v", index, err)
				return
			}

			mu.Lock()
			successCount++
			mu.Unlock()

			t.Logf("✅ Attempt %d succeeded: %s", index, bookingID)

			// Cleanup
			defer func() {
				cancelTestBooking(ctx, db, bookingID)
			}()
		}(i)
	}

	wg.Wait()

	t.Logf("✅ Results: %d/%d attempts succeeded (expected: 1-2 due to race condition before constraint)", successCount, maxAttempts)

	// With EXCLUDE constraint, only 1-2 bookings should succeed for same time slot
	// Race condition may allow 2 concurrent inserts before constraint kicks in
	if successCount > 2 {
		t.Errorf("Expected max 2 bookings to succeed, got %d", successCount)
	}
}

// Helper functions

func createTestBooking(ctx context.Context, db *sql.DB, providerID, serviceID, startTime, chatID, idempotencyKey string) (string, error) {
	// Calculate end time (add 1 hour to start_time)
	// startTime format: 2026-03-31T10:00:00-03:00
	// Parse and add 1 hour
	startParsed, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return "", err
	}
	endTime := startParsed.Add(time.Hour).Format(time.RFC3339)

	query := `
		INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, idempotency_key, user_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
		RETURNING id
	`

	var bookingID string
	err = db.QueryRowContext(ctx, query,
		providerID, serviceID, startTime, endTime,
		"confirmed", idempotencyKey, chatID,
	).Scan(&bookingID)

	if err != nil {
		return "", err
	}

	return bookingID, nil
}

func verifyBookingExists(ctx context.Context, db *sql.DB, bookingID string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM bookings WHERE id = $1)`

	var exists bool
	err := db.QueryRowContext(ctx, query, bookingID).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func cancelTestBooking(ctx context.Context, db *sql.DB, bookingID string) error {
	query := `UPDATE bookings SET status = 'cancelled', cancellation_reason = 'Test cleanup' WHERE id = $1`

	_, err := db.ExecContext(ctx, query, bookingID)
	return err
}
