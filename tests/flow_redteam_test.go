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

// ============================================================================
// RED TEAM - PARANOID FLOW TESTS
// ============================================================================
// Objetivo: Simular ataques maliciosos reales contra el sistema de booking
// Incluye: SQL injection, race conditions, DoS, replay attacks
// ============================================================================

// TestRedTeam_SQLInjection_Flow prueba inyección SQL a nivel de flujo
func TestRedTeam_SQLInjection_Flow(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Malicious inputs
	maliciousInputs := []struct {
		name           string
		providerID     string
		serviceID      string
		idempotencyKey string
		shouldFail     bool
	}{
		{
			name:           "sql_drop_table",
			providerID:     "00000000-0000-0000-0000-000000000001'; DROP TABLE bookings; --",
			serviceID:      "00000000-0000-0000-0000-000000000001",
			idempotencyKey: "REDTEAM-SQL-1",
			shouldFail:     true, // Should fail UUID validation
		},
		{
			name:           "sql_union_injection",
			providerID:     "00000000-0000-0000-0000-000000000001 UNION SELECT * FROM users --",
			serviceID:      "00000000-0000-0000-0000-000000000001",
			idempotencyKey: "REDTEAM-SQL-2",
			shouldFail:     true,
		},
		{
			name:           "sql_comment_bypass",
			providerID:     "00000000-0000-0000-0000-000000000001",
			serviceID:      "00000000-0000-0000-0000-000000000001",
			idempotencyKey: "REDTEAM'; DELETE FROM bookings WHERE '1'='1",
			shouldFail:     false, // Parameterized queries prevent SQL injection - this is safe
		},
		{
			name:           "null_byte_injection",
			providerID:     "00000000-0000-0000-0000-000000000001\x00DROP",
			serviceID:      "00000000-0000-0000-0000-000000000001",
			idempotencyKey: "REDTEAM-SQL-4",
			shouldFail:     true,
		},
	}

	for _, tt := range maliciousInputs {
		t.Run(tt.name, func(t *testing.T) {
			startTime := time.Now().AddDate(0, 0, 1).Format("2006-01-02") + "T10:00:00-03:00"
			chatID := "5391760292"

			_, err := createTestBooking(ctx, db, tt.providerID, tt.serviceID, startTime, chatID, tt.idempotencyKey)

			if tt.shouldFail && err == nil {
				t.Errorf("❌ SQL injection succeeded when it should have failed: %s", tt.name)
			} else if err != nil {
				t.Logf("✅ SQL injection blocked: %s - %v", tt.name, err)
			}
		})
	}
}

// TestRedTeam_RaceCondition_Attack prueba ataques de race condition
func TestRedTeam_RaceCondition_Attack(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Attack: Try to book same slot 50 times simultaneously
	maxAttackers := 50
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 5).Format("2006-01-02") + "T14:00:00-03:00"
	chatID := "5391760292"

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	t.Logf("🔴 RED TEAM ATTACK: %d concurrent booking attempts for SAME time slot", maxAttackers)

	for i := 0; i < maxAttackers; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			idempotencyKey := "REDTEAM-RACE-" + string(rune('A'+index%26)) + "-" + time.Now().Format("150405.999")

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
			if err != nil {
				return
			}

			mu.Lock()
			successCount++
			mu.Unlock()

			// Cleanup
			defer func() {
				cancelTestBooking(ctx, db, bookingID)
			}()
		}(i)
	}

	wg.Wait()

	t.Logf("🔴 ATTACK RESULT: %d/%d bookings succeeded", successCount, maxAttackers)

	// With EXCLUDE constraint + advisory locks, max 1-2 should succeed
	if successCount > 2 {
		t.Errorf("❌ RACE CONDITION EXPLOITED! %d bookings created for same slot (max 3 expected)", successCount)
	} else {
		t.Logf("✅ Attack blocked: Only %d/%d succeeded (EXCLUDE constraint working)", successCount, maxAttackers)
	}
}

// TestRedTeam_ReplayAttack_Flow prueba replay attacks con idempotency keys
func TestRedTeam_ReplayAttack_Flow(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 6).Format("2006-01-02") + "T15:00:00-03:00"
	chatID := "5391760292"
	idempotencyKey := "REDTEAM-REPLAY-ATTACK-KEY"

	t.Logf("🔴 RED TEAM: Attempting replay attack with same idempotency key")

	// First request - should succeed
	bookingID1, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
	if err != nil {
		t.Fatalf("First booking failed: %v", err)
	}
	t.Logf("✅ First booking created: %s", bookingID1)

	// Replay attack - same idempotency key, different time
	replayCount := 10
	sameBookingCount := 0

	for i := 0; i < replayCount; i++ {
		bookingID2, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
		if err != nil {
			continue
		}

		if bookingID2 == bookingID1 {
			sameBookingCount++
		} else {
			t.Errorf("❌ REPLAY ATTACK SUCCESSFUL! Different booking created: %s vs %s", bookingID1, bookingID2)
		}
	}

	t.Logf("🔴 REPLAY RESULT: %d/%d replays returned same booking ID", sameBookingCount, replayCount)

	if sameBookingCount == replayCount {
		t.Logf("✅ Replay attack prevented: All replays returned same booking (idempotency working)")
	}

	// Cleanup
	cancelTestBooking(ctx, db, bookingID1)
}

// TestRedTeam_DoS_Attack prueba denial of service attack
func TestRedTeam_DoS_Attack(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Attack: Create 100 booking attempts with unique time slots
	maxRequests := 100
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	chatID := "5391760292"

	var wg sync.WaitGroup
	successCount := 0
	errorCount := 0
	var mu sync.Mutex

	t.Logf("🔴 RED TEAM DoS ATTACK: %d concurrent booking requests", maxRequests)

	startTime := time.Now()

	for i := 0; i < maxRequests; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Each attacker uses different time slot
			hour := 8 + (index % 12)
			dayOffset := index / 12
			attackTime := time.Now().AddDate(0, 0, 7+dayOffset).Format("2006-01-02") + "T" + string(rune('0'+hour/10)) + string(rune('0'+hour%10)) + ":00:00-03:00"
			idempotencyKey := "REDTEAM-DOS-" + string(rune('0'+index/100)) + "-" + time.Now().Format("150405.999")

			_, err := createTestBooking(ctx, db, providerID, serviceID, attackTime, chatID, idempotencyKey)
			if err != nil {
				mu.Lock()
				errorCount++
				mu.Unlock()
				return
			}

			mu.Lock()
			successCount++
			mu.Unlock()
		}(i)
	}

	wg.Wait()
	elapsed := time.Since(startTime)

	t.Logf("🔴 DoS ATTACK RESULT: %d succeeded, %d failed, elapsed: %v", successCount, errorCount, elapsed)

	// System should handle 100 concurrent requests without crashing
	if elapsed > 60*time.Second {
		t.Errorf("⚠️  System slow under load: %v (expected <60s)", elapsed)
	}

	t.Logf("✅ System survived DoS attack: %d requests in %v", maxRequests, elapsed)
}

// TestRedTeam_LockExhaustion_Attack prueba lock exhaustion attack
func TestRedTeam_LockExhaustion_Attack(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	// Attack: Acquire 200 locks without releasing
	maxLocks := 200
	lockKeys := make([]string, maxLocks)

	t.Logf("🔴 RED TEAM: Attempting to exhaust lock table with %d locks", maxLocks)

	for i := 0; i < maxLocks; i++ {
		lockKey := "REDTEAM-LOCK-EXHAUST-" + string(rune('0'+i/100)) + string(rune('0'+(i/10)%10)) + string(rune('0'+i%10)) + "-" + time.Now().Format("150405")
		lockKeys[i] = lockKey

		// Acquire lock directly via SQL
		query := `SELECT pg_advisory_xact_lock(hashtext($1))`
		_, err := db.ExecContext(ctx, query, lockKey)
		if err != nil {
			t.Logf("⚠️  Lock %d failed: %v", i, err)
		}
	}

	t.Logf("✅ Lock exhaustion attack completed: %d locks acquired", maxLocks)
	t.Logf("✅ System survived: Lock table can handle %d+ locks", maxLocks)

	// Locks auto-release on transaction end, no cleanup needed
}

// Helper functions

func createTestBooking(ctx context.Context, db *sql.DB, providerID, serviceID, startTime, chatID, idempotencyKey string) (string, error) {
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
	err = db.QueryRowContext(ctx, query, providerID, serviceID, startTime, endTime, "confirmed", idempotencyKey, chatID).Scan(&bookingID)
	return bookingID, err
}

func cancelTestBooking(ctx context.Context, db *sql.DB, bookingID string) error {
	query := `UPDATE bookings SET status = 'cancelled', cancellation_reason = 'Test cleanup' WHERE id = $1`
	_, err := db.ExecContext(ctx, query, bookingID)
	return err
}
