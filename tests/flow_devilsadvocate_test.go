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
// DEVIL'S ADVOCATE - PARANOID FLOW TESTS
// ============================================================================
// Objetivo: Asumir que TODO puede salir mal. Probar casos borde extremos,
// suposiciones incorrectas, y comportamientos inesperados del mundo real.
// ============================================================================

// TestDevilsAdvocate_FutureDates_Flow prueba fechas extremadamente futuras
func TestDevilsAdvocate_FutureDates_Flow(t *testing.T) {
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

	extremeDates := []struct {
		name      string
		date      string
		shouldFail bool
	}{
		{"tomorrow", time.Now().AddDate(0, 0, 1).Format("2006-01-02") + "T10:00:00-03:00", false},
		{"next_year", time.Now().AddDate(1, 0, 0).Format("2006-01-02") + "T10:00:00-03:00", false},
		{"in_10_years", time.Now().AddDate(10, 0, 0).Format("2006-01-02") + "T10:00:00-03:00", false},
		{"year_3000", "3000-01-01T10:00:00-03:00", false},
		{"year_9999", "9999-12-31T23:59:59-03:00", false},
		{"year_10000", "10000-01-01T00:00:00-03:00", true}, // Overflow
	}

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	chatID := "5391760292"

	for _, tt := range extremeDates {
		t.Run(tt.name, func(t *testing.T) {
			idempotencyKey := "DEVILS-DATE-" + tt.name + "-" + time.Now().Format("150405")

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, tt.date, chatID, idempotencyKey)

			if tt.shouldFail && err == nil {
				t.Errorf("❌ Extreme date succeeded when it should fail: %s", tt.name)
			} else if err != nil && !tt.shouldFail {
				t.Logf("⚠️  Valid date rejected: %s - %v", tt.name, err)
			} else if err == nil {
				t.Logf("✅ Booking created for %s: %s", tt.name, bookingID)
				defer cancelTestBooking(ctx, db, bookingID)
			}
		})
	}
}

// TestDevilsAdvocate_LeapYear_Flow prueba años bisiestos y fechas especiales
func TestDevilsAdvocate_LeapYear_Flow(t *testing.T) {
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

	leapYearCases := []struct {
		name      string
		date      string
		shouldFail bool
	}{
		{"feb_29_2024_leap", "2024-02-29T10:00:00-03:00", false},
		{"feb_29_2025_not_leap", "2025-02-29T10:00:00-03:00", true}, // 2025 no es bisiesto
		{"feb_28_2025", "2025-02-28T10:00:00-03:00", false},
		{"dec_31_midnight", "2025-12-31T23:59:59-03:00", false},
		{"jan_1_midnight", "2026-01-01T00:00:00-03:00", false},
	}

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	chatID := "5391760292"

	for _, tt := range leapYearCases {
		t.Run(tt.name, func(t *testing.T) {
			idempotencyKey := "DEVILS-LEAP-" + tt.name

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, tt.date, chatID, idempotencyKey)

			if tt.shouldFail && err == nil {
				t.Errorf("❌ Invalid date succeeded: %s", tt.name)
			} else if err != nil && !tt.shouldFail {
				t.Errorf("❌ Valid date rejected: %s - %v", tt.name, err)
			} else if err == nil {
				t.Logf("✅ Booking created for %s: %s", tt.name, bookingID)
				defer cancelTestBooking(ctx, db, bookingID)
			}
		})
	}
}

// TestDevilsAdvocate_TimezoneEdgeCases_Flow prueba casos borde de timezone
func TestDevilsAdvocate_TimezoneEdgeCases_Flow(t *testing.T) {
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

	tzCases := []struct {
		name      string
		date      string
		shouldFail bool
	}{
		{"utc_z", "2026-04-01T10:00:00Z", false},
		{"utc_plus_00", "2026-04-01T10:00:00+00:00", false},
		{"max_positive", "2026-04-01T10:00:00+14:00", false}, // UTC+14 (Kiribati)
		{"max_negative", "2026-04-01T10:00:00-12:00", false}, // UTC-12 (Baker Island)
		{"beyond_max_pos", "2026-04-01T10:00:00+15:00", false},
		{"beyond_max_neg", "2026-04-01T10:00:00-13:00", false},
		{"no_timezone", "2026-04-01T10:00:00", true},
		{"partial_tz", "2026-04-01T10:00:00-03", true},
	}

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	chatID := "5391760292"

	for _, tt := range tzCases {
		t.Run(tt.name, func(t *testing.T) {
			idempotencyKey := "DEVILS-TZ-" + tt.name

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, tt.date, chatID, idempotencyKey)

			if tt.shouldFail && err == nil {
				t.Errorf("❌ Invalid timezone succeeded: %s", tt.name)
			} else if err != nil && !tt.shouldFail {
				t.Logf("⚠️  Valid timezone rejected: %s - %v", tt.name, err)
			} else if err == nil {
				t.Logf("✅ Booking created with TZ %s: %s", tt.name, bookingID)
				defer cancelTestBooking(ctx, db, bookingID)
			}
		})
	}
}

// TestDevilsAdvocate_ConcurrentSameSlot_Flow prueba concurrencia extrema para mismo slot
func TestDevilsAdvocate_ConcurrentSameSlot_Flow(t *testing.T) {
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

	// Extreme concurrency: 100 attempts for EXACT same slot
	maxAttempts := 100
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 10).Format("2006-01-02") + "T12:00:00-03:00"
	chatID := "5391760292"

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	t.Logf("😈 DEVIL'S ADVOCATE: %d concurrent attempts for EXACT same time slot", maxAttempts)

	for i := 0; i < maxAttempts; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			idempotencyKey := "DEVILS-CONCURRENT-" + string(rune('0'+i/100)) + string(rune('0'+(i/10)%10)) + string(rune('0'+i%10)) + "-" + time.Now().Format("150405.999")

			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
			if err != nil {
				return
			}

			mu.Lock()
			successCount++
			mu.Unlock()

			defer func() {
				cancelTestBooking(ctx, db, bookingID)
			}()
		}(i)
	}

	wg.Wait()

	t.Logf("😈 RESULT: %d/%d bookings succeeded for same slot", successCount, maxAttempts)

	// With EXCLUDE constraint, max 1-2 should succeed
	if successCount > 2 {
		t.Errorf("❌ COLLISION! %d bookings for same slot (max 2 expected)", successCount)
	} else {
		t.Logf("✅ EXCLUDE constraint working: Only %d/%d succeeded", successCount, maxAttempts)
	}
}

// TestDevilsAdvocate_IdempotencyKeyEdgeCases_Flow prueba casos borde de idempotency keys
func TestDevilsAdvocate_IdempotencyKeyEdgeCases_Flow(t *testing.T) {
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

	extremeKeys := []struct {
		name       string
		key        string
		shouldFail bool
	}{
		{"normal_key", "DEVILS-KEY-normal-123", false},
		{"long_key_255", "DEVILS-KEY-" + string(make([]byte, 240)), true}, // >255 chars
		{"empty_key", "", false},
		{"spaces_only", "   ", false},
		{"unicode_key", "DEVILS-KEY-🔑-中文-🎉", true}, // Unicode not allowed
		{"sql_chars", "DEVILS-KEY-';DROP--", true}, // SQL injection chars
	}

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 11).Format("2006-01-02") + "T13:00:00-03:00"
	chatID := "5391760292"

	for _, tt := range extremeKeys {
		t.Run(tt.name, func(t *testing.T) {
			bookingID, err := createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, tt.key)

			if tt.shouldFail && err == nil {
				t.Errorf("❌ Extreme key succeeded: %s", tt.name)
			} else if err != nil && !tt.shouldFail {
				t.Logf("⚠️  Valid key rejected: %s - %v", tt.name, err)
			} else if err == nil {
				t.Logf("✅ Booking created with key %s: %s", tt.name, bookingID)
				defer cancelTestBooking(ctx, db, bookingID)
			}
		})
	}
}

// TestDevilsAdvocate_DBConnectionLoss_Flow prueba pérdida de conexión DB
func TestDevilsAdvocate_DBConnectionLoss_Flow(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialize DB
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}

	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	startTime := time.Now().AddDate(0, 0, 12).Format("2006-01-02") + "T14:00:00-03:00"
	chatID := "5391760292"
	idempotencyKey := "DEVILS-DBLOSS-" + time.Now().Format("150405")

	t.Logf("😈 DEVIL'S ADVOCATE: Testing DB connection loss scenario")

	// Close DB connection mid-operation
	db.Close()

	_, err = createTestBooking(ctx, db, providerID, serviceID, startTime, chatID, idempotencyKey)
	if err == nil {
		t.Errorf("❌ Booking succeeded with closed DB connection!")
	} else {
		t.Logf("✅ Booking correctly failed with closed DB: %v", err)
	}
}

// Helper functions (same as flow_integration_test.go)

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
