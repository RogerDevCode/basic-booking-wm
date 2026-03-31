package inner

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"booking-titanium-wm/internal/infrastructure"
)

// ============================================================================
// DEVIL'S ADVOCATE - PARANOID EDGE CASE TESTS
// ============================================================================
// Objetivo: Asumir que TODO puede salir mal. Probar casos borde extremos,
// suposiciones incorrectas, y comportamientos inesperados del mundo real.
// ============================================================================

// TestDevilsAdvocate_FutureDates prueba fechas extremadamente futuras
func TestDevilsAdvocate_FutureDates(t *testing.T) {
	extremeDates := []struct {
		name      string
		startTime string
		wantValid bool
	}{
		{"tomorrow", time.Now().AddDate(0, 0, 1).Format(time.RFC3339), true},
		{"next_year", time.Now().AddDate(1, 0, 0).Format(time.RFC3339), true},
		{"in_10_years", time.Now().AddDate(10, 0, 0).Format(time.RFC3339), true},
		{"in_100_years", time.Now().AddDate(100, 0, 0).Format(time.RFC3339), true},
		{"year_3000", "3000-01-01T10:00:00-03:00", true}, // Técnicamente válido
		{"year_9999", "9999-12-31T23:59:59-03:00", true}, // Máximo PostgreSQL
		{"year_10000", "10000-01-01T00:00:00-03:00", false}, // Overflow
	}

	for _, tt := range extremeDates {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     "00000000-0000-0000-0000-000000000001",
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      tt.startTime,
				IdempotencyKey: "SEED-TEST-001",
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v for date: %s",
					result.Valid, tt.wantValid, tt.startTime)
			}
		})
	}
}

// TestDevilsAdvocate_LeapYears prueba años bisiestos y fechas especiales
func TestDevilsAdvocate_LeapYears(t *testing.T) {
	leapYearCases := []struct {
		name      string
		startTime string
		wantValid bool
	}{
		{"feb_29_2024", "2024-02-29T10:00:00-03:00", true}, // Año bisiesto
		{"feb_29_2025", "2025-02-29T10:00:00-03:00", false}, // NO es bisiesto
		{"feb_28_2025", "2025-02-28T10:00:00-03:00", true},
		{"dec_31_midnight", "2025-12-31T23:59:59-03:00", true},
		{"jan_1_midnight", "2026-01-01T00:00:00-03:00", true},
		{"dst_start", "2026-10-04T02:00:00-03:00", true}, // Inicio DST
		{"dst_end", "2026-03-15T02:00:00-03:00", true}, // Fin DST
	}

	for _, tt := range leapYearCases {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     "00000000-0000-0000-0000-000000000001",
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      tt.startTime,
				IdempotencyKey: "SEED-TEST-001",
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v", result.Valid, tt.wantValid)
			}
		})
	}
}

// TestDevilsAdvocate_ConcurrentBooking prueba bookings simultáneos para mismo slot
func TestDevilsAdvocate_ConcurrentBooking(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx := context.Background()
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		t.Skipf("Skipping test, DB not reachable: %v", err)
	}

// Mismo slot, diferentes idempotency keys
	baseSlot := SeedSlotRequest{
		ProviderID:      "00000000-0000-0000-0000-000000000001",
		ServiceID:       "00000000-0000-0000-0000-000000000001",
		StartTime:       "2026-04-01T10:00:00-03:00",
		EndTime:         "2026-04-01T11:00:00-03:00",
		ChatID:          "5391760292",
		DurationMinutes: 60,
		Source:          "DEVILS-ADVOCATE",
	}

	numAttempts := 5
	results := make(chan BookingResult, numAttempts)

// Intentar crear bookings simultáneos para el MISMO slot
	for i := 0; i < numAttempts; i++ {
		go func(attempt int) {
			slot := baseSlot
			slot.IdempotencyKey = "CONCURRENT-ATTEMPT-" + string(rune(attempt))
			result := createSeedBooking(ctx, db, slot)
			results <- result
		}(i)
	}

// Contar éxitos
	var successCount int
	for i := 0; i < numAttempts; i++ {
		result := <-results
		if result.Success {
			successCount++
			t.Logf("Booking %d: Success=%v, ID=%s, Duplicate=%v",
				i, result.Success, result.BookingID, result.IsDuplicate)
		}
	}

// PARANOIA CHECK: Solo 1 booking debería tener éxito (EXCLUDE constraint)
	if successCount > 1 {
		t.Errorf("❌ COLLISION DETECTED! %d bookings created for same slot!", successCount)
	}

// Cleanup
	cleanupQuery := `DELETE FROM bookings WHERE idempotency_key LIKE 'CONCURRENT-ATTEMPT-%'`
	db.ExecContext(ctx, cleanupQuery)
}

// TestDevilsAdvocate_GCalUnavailable prueba qué pasa si GCal no está disponible
func TestDevilsAdvocate_GCalUnavailable(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx := context.Background()
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		t.Skipf("Skipping test, DB not reachable: %v", err)
	}

// Crear booking exitosamente
	slot := SeedSlotRequest{
		ProviderID:      "00000000-0000-0000-0000-000000000001",
		ServiceID:       "00000000-0000-0000-0000-000000000001",
		StartTime:       "2026-04-01T12:00:00-03:00",
		EndTime:         "2026-04-01T13:00:00-03:00",
		ChatID:          "5391760292",
		IdempotencyKey:  "GCal-DOWN-TEST",
		DurationMinutes: 60,
		Source:          "DEVILS-ADVOCATE",
	}

// Crear booking
	bookingResult := createSeedBooking(ctx, db, slot)
	if !bookingResult.Success {
		t.Fatalf("Booking creation failed: %v", bookingResult.Error)
	}
	t.Logf("✅ Booking created in DB: %s", bookingResult.BookingID)

// Ahora intentar sincronizar con GCal (asumir que GCal está caído)
// LAW-13: DB is source of truth, GCal failure should NOT rollback DB
	gcalResult := syncToGCal(ctx, db, bookingResult.BookingID)

// GCal puede fallar, pero el booking debería persistir
	t.Logf("GCal sync result: Success=%v, Error=%v", gcalResult.Success, gcalResult.Error)

// Verificar que el booking sigue en DB
	var exists bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM bookings WHERE id = $1)`
	err = db.QueryRowContext(ctx, checkQuery, bookingResult.BookingID).Scan(&exists)
	if err != nil {
		t.Errorf("❌ Failed to verify booking existence: %v", err)
	}

	if !exists {
		t.Errorf("❌ BOOKING LOST! DB rollback occurred despite GCal failure")
	} else {
		t.Logf("✅ Booking persists in DB despite GCal issues (LAW-13 compliant)")
	}

// Cleanup
	cleanupQuery := `DELETE FROM bookings WHERE idempotency_key = $1`
	db.ExecContext(ctx, cleanupQuery, slot.IdempotencyKey)
}

// TestDevilsAdvocate_LockTimeout prueba qué pasa si un lock nunca se libera
func TestDevilsAdvocate_LockTimeout(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx := context.Background()
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		t.Fatalf("Failed to initialize DB: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		t.Skipf("Skipping test, DB not reachable: %v", err)
	}

	lockKey := "devils-advocate-timeout-test"
	ownerToken := "process-1"

// Adquirir lock
	result1 := acquireLock(ctx, db, lockKey, ownerToken)
	if !result1.Acquired {
		t.Fatalf("Failed to acquire initial lock: %v", result1.Error)
	}
	t.Logf("✅ Lock acquired: %s", result1.OwnerToken)

// NO liberar el lock (simular proceso que crashea)
// Esperar a que expire (5 minutos según schema)
// En vez de esperar, verificar que el schema tiene expires_at

	var expiresAt time.Time
	checkQuery := `SELECT expires_at FROM booking_locks WHERE lock_key = $1`
	err = db.QueryRowContext(ctx, checkQuery, lockKey).Scan(&expiresAt)
	if err != nil {
		t.Errorf("❌ Failed to check lock expiration: %v", err)
	}

	t.Logf("Lock expires at: %v (duration: %v)", expiresAt, time.Until(expiresAt))

// PARANOIA CHECK: Verificar que expires_at está en el futuro pero no demasiado
	if expiresAt.Before(time.Now()) {
		t.Errorf("❌ Lock already expired! Timeout mechanism broken")
	}

	if time.Until(expiresAt) > 10*time.Minute {
		t.Errorf("⚠️  Lock timeout too long (>10 min), could cause availability issues")
	}

// Cleanup manual
	releaseLock(ctx, db, lockKey, ownerToken)
}

// TestDevilsAdvocate_UnicodeInputs prueba inputs con unicode complejo
func TestDevilsAdvocate_UnicodeInputs(t *testing.T) {
	unicodeCases := []struct {
		name          string
		providerID    string
		idempotencyKey string
		wantValid     bool
	}{
		{"emoji_provider", "👨‍⚕️-001", "SEED-👨‍⚕️-001", false}, // Emoji en UUID
		{"chinese_chars", "医生 -001", "SEED-医生 -001", false}, // Chino en UUID
		{"arabic_chars", "طبيب-001", "SEED-طبيب -001", false}, // Árabe en UUID
		{"zero_width_space", "001\u200b", "SEED-001\u200b", false}, // Zero-width space
		{"right_to_left", "\u202E001", "SEED-\u202E001", false}, // RTL override
		{"valid_uuid", "00000000-0000-0000-0000-000000000001", "SEED-001", true},
	}

	for _, tt := range unicodeCases {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     tt.providerID,
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      "2026-04-01T10:00:00-03:00",
				IdempotencyKey: tt.idempotencyKey,
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v", result.Valid, tt.wantValid)
			}
		})
	}
}

// TestDevilsAdvocate_MassiveIdempotencyKey prueba keys de idempotencia enormes
func TestDevilsAdvocate_MassiveIdempotencyKey(t *testing.T) {
	extremeKeys := []struct {
		name          string
		keyLength     int
		wantValid     bool
	}{
		{"normal_key", 50, true},
		{"long_key", 255, true},
		{"very_long_key", 500, true}, // Debería truncarse o validarse
		{"max_varchar", 1000, true},
		{"extreme_key", 10000, false}, // Demasiado largo
	}

	for _, tt := range extremeKeys {
		t.Run(tt.name, func(t *testing.T) {
			key := "SEED-" + strings.Repeat("A", tt.keyLength)

			slot := SeedSlotRequest{
				ProviderID:     "00000000-0000-0000-0000-000000000001",
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      "2026-04-01T10:00:00-03:00",
				IdempotencyKey: key,
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v for key length %d",
					result.Valid, tt.wantValid, tt.keyLength)
			}
		})
	}
}

// TestDevilsAdvocate_TimezoneEdgeCases prueba casos borde de timezone
func TestDevilsAdvocate_TimezoneEdgeCases(t *testing.T) {
	tzCases := []struct {
		name      string
		startTime string
		wantValid bool
	}{
		{"utc_z", "2026-04-01T10:00:00Z", true},
		{"utc_plus_00", "2026-04-01T10:00:00+00:00", true},
		{"utc_minus_00", "2026-04-01T10:00:00-00:00", true},
		{"max_positive", "2026-04-01T10:00:00+14:00", true}, // UTC+14 (Kiribati)
		{"max_negative", "2026-04-01T10:00:00-12:00", true}, // UTC-12 (Baker Island)
		{"beyond_max_pos", "2026-04-01T10:00:00+15:00", false},
		{"beyond_max_neg", "2026-04-01T10:00:00-13:00", false},
		{"no_timezone", "2026-04-01T10:00:00", false},
		{"partial_tz", "2026-04-01T10:00:00-03", false},
	}

	for _, tt := range tzCases {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     "00000000-0000-0000-0000-000000000001",
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      tt.startTime,
				IdempotencyKey: "SEED-TEST-001",
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v", result.Valid, tt.wantValid)
			}
		})
	}
}
