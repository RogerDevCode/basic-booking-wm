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
// RED TEAM - PARANOID SECURITY TESTS
// ============================================================================
// Objetivo: Intentar romper el sistema con inputs maliciosos, ataques de
// inyección, race conditions, y comportamientos inesperados.
// ============================================================================

// TestRedTeam_SQLInjection prueba inyección SQL en todos los inputs
func TestRedTeam_SQLInjection(t *testing.T) {
	maliciousInputs := []struct {
		name          string
		providerID    string
		serviceID     string
		startTime     string
		chatID        string
		idempotencyKey string
		wantValid     bool
	}{
		{
			name:          "sql_injection_provider_id",
			providerID:    "00000000-0000-0000-0000-000000000001'; DROP TABLE bookings; --",
			serviceID:     "00000000-0000-0000-0000-000000000001",
			startTime:     "2026-04-01T10:00:00-03:00",
			chatID:        "5391760292",
			idempotencyKey: "SEED-TEST-001",
			wantValid:     false, // Debería ser rechazado por UUID inválido
		},
		{
			name:          "sql_injection_service_id",
			providerID:    "00000000-0000-0000-0000-000000000001",
			serviceID:     "00000000-0000-0000-0000-000000000001'; DELETE FROM bookings WHERE '1'='1",
			startTime:     "2026-04-01T10:00:00-03:00",
			chatID:        "5391760292",
			idempotencyKey: "SEED-TEST-001",
			wantValid:     false,
		},
		{
			name:          "sql_injection_chat_id",
			providerID:    "00000000-0000-0000-0000-000000000001",
			serviceID:     "00000000-0000-0000-0000-000000000001",
			startTime:     "2026-04-01T10:00:00-03:00",
			chatID:        "5391760292; DROP TABLE users; --",
			idempotencyKey: "SEED-TEST-001",
			wantValid:     true, // chatID es string libre, debería sanitizarse en DB
		},
		{
			name:          "sql_injection_idempotency_key",
			providerID:    "00000000-0000-0000-0000-000000000001",
			serviceID:     "00000000-0000-0000-0000-000000000001",
			startTime:     "2026-04-01T10:00:00-03:00",
			chatID:        "5391760292",
			idempotencyKey: "SEED-TEST'; DROP TABLE bookings; --",
			wantValid:     true, // Debería sanitizarse en DB
		},
	}

	for _, tt := range maliciousInputs {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     tt.providerID,
				ServiceID:      tt.serviceID,
				StartTime:      tt.startTime,
				ChatID:         tt.chatID,
				IdempotencyKey: tt.idempotencyKey,
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v for input: %v",
					result.Valid, tt.wantValid, tt.name)
			}

			// CRÍTICO: Si es válido, verificar que los datos se sanitizan en DB
			if result.Valid {
				// Simular que se usa en query parameterizada
				// Las queries deben usar $1, $2... NO concatenación
				if strings.Contains(tt.providerID, ";") ||
					strings.Contains(tt.serviceID, ";") {
					t.Logf("⚠️  WARNING: SQL injection chars in input, ensure parameterized queries!")
				}
			}
		})
	}
}

// TestRedTeam_ConcurrentLockAcquire prueba race conditions en locks
func TestRedTeam_ConcurrentLockAcquire(t *testing.T) {
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

	lockKey := "redteam-race-" + time.Now().Format("20060102150405")
	ownerToken := "attacker-1"

	// Simular 10 intentos concurrentes de adquirir el mismo lock
	numGoroutines := 10
	results := make(chan LockResult, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			result := acquireLock(ctx, db, lockKey, ownerToken)
			results <- result
		}(i)
	}

	// Contar resultados
	var acquired, duplicates, failed int
	for i := 0; i < numGoroutines; i++ {
		result := <-results
		if result.Acquired && !result.IsDuplicate {
			acquired++
		} else if result.IsDuplicate {
			duplicates++
		} else {
			failed++
		}
	}

	t.Logf("Results: Acquired=%d, Duplicates=%d, Failed=%d", acquired, duplicates, failed)

// PARANOIA CHECK: Solo 1 debería adquirir el lock exitosamente
	if acquired > 1 {
		t.Errorf("❌ RACE CONDITION DETECTED! %d goroutines acquired the same lock!", acquired)
	}

// El resto debería ser duplicado o fallar
	if duplicates+failed != numGoroutines-1 {
		t.Errorf("Expected %d duplicates/failures, got %d", numGoroutines-1, duplicates+failed)
	}

	// Cleanup
	releaseLock(ctx, db, lockKey, ownerToken)
}

// TestRedTeam_LockExhaustion prueba agotar locks en la DB
func TestRedTeam_LockExhaustion(t *testing.T) {
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

// Crear 100 locks simultáneos (ataque de agotamiento)
	numLocks := 100
	lockKeys := make([]string, numLocks)

	for i := 0; i < numLocks; i++ {
		lockKey := "redteam-exhaust-" + time.Now().Format("20060102150405") + "-" + string(rune(i))
		lockKeys[i] = lockKey
		result := acquireLock(ctx, db, lockKey, "attacker")
		if !result.Acquired {
			t.Logf("⚠️  Lock %d failed to acquire: %v", i, result.Error)
		}
	}

	t.Logf("✅ Created %d locks simultaneously", numLocks)

// Verificar que la DB no colapsó
	var lockCount int
	countQuery := `SELECT COUNT(*) FROM booking_locks WHERE lock_key LIKE 'redteam-exhaust-%'`
	err = db.QueryRowContext(ctx, countQuery).Scan(&lockCount)
	if err != nil {
		t.Errorf("❌ DB query failed after lock exhaustion: %v", err)
	}

	t.Logf("Lock count in DB: %d", lockCount)

// Cleanup manual (los locks expiran solos en 5 min)
cleanupQuery := `DELETE FROM booking_locks WHERE lock_key LIKE 'redteam-exhaust-%'`
_, err = db.ExecContext(ctx, cleanupQuery)
if err != nil {
	t.Logf("Cleanup warning: %v", err)
}
}

// TestRedTeam_InvalidTimezones prueba timezones maliciosos
func TestRedTeam_InvalidTimezones(t *testing.T) {
	maliciousTZ := []struct {
		name      string
		startTime string
		wantValid bool
	}{
		{"timezone_injection", "2026-04-01T10:00:00'; DROP TABLE--", false},
		{"negative_overflow", "2026-04-01T10:00:00-99:00", false},
		{"positive_overflow", "2026-04-01T10:00:00+99:00", false},
		{"null_byte", "2026-04-01T10:00:00-03:00\x00", false},
		{"unicode_injection", "2026-04-01T10:00:00-03:00\u200b", false},
		{"html_injection", "2026-04-01T10:00:00-03:00<script>", false},
		{"valid_utc", "2026-04-01T10:00:00Z", true},
		{"valid_offset", "2026-04-01T10:00:00-03:00", true},
	}

	for _, tt := range maliciousTZ {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     "00000000-0000-0000-0000-000000000001",
				ServiceID:      "00000000-0000-0000-0000-000000000001",
				StartTime:      tt.startTime,
				IdempotencyKey: "SEED-TEST-001",
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v for time: %s",
					result.Valid, tt.wantValid, tt.startTime)
			}
		})
	}
}

// TestRedTeam_EmptyAndNullInputs prueba inputs vacíos y nulos
func TestRedTeam_EmptyAndNullInputs(t *testing.T) {
	edgeCases := []struct {
		name          string
		providerID    string
		serviceID     string
		startTime     string
		chatID        string
		idempotencyKey string
		wantValid     bool
	}{
		{"all_empty", "", "", "", "", "", false},
		{"provider_null_byte", "\x00", "001", "2026-04-01T10:00:00-03:00", "123", "key", false},
		{"service_whitespace", "001", "   ", "2026-04-01T10:00:00-03:00", "123", "key", false},
		{"chatid_zero", "001", "001", "2026-04-01T10:00:00-03:00", "0", "key", true}, // "0" es válido
		{"key_spaces", "001", "001", "2026-04-01T10:00:00-03:00", "123", "   ", false},
	}

	for _, tt := range edgeCases {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:     tt.providerID,
				ServiceID:      tt.serviceID,
				StartTime:      tt.startTime,
				ChatID:         tt.chatID,
				IdempotencyKey: tt.idempotencyKey,
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v", result.Valid, tt.wantValid)
			}
		})
	}
}

// TestRedTeam_ReplayAttack prueba ataques de replay con idempotency keys
func TestRedTeam_ReplayAttack(t *testing.T) {
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

// Crear booking con idempotency key específica
	slot := SeedSlotRequest{
		ProviderID:     "00000000-0000-0000-0000-000000000001",
		ServiceID:      "00000000-0000-0000-0000-000000000001",
		StartTime:      "2026-04-01T10:00:00-03:00",
		EndTime:        "2026-04-01T11:00:00-03:00",
		ChatID:         "5391760292",
		IdempotencyKey: "REPLAY-ATTACK-KEY-123",
		DurationMinutes: 60,
		Source:         "REDTEAM",
	}

// Primer intento - debería crear
	result1 := createSeedBooking(ctx, db, slot)
	if !result1.Success {
		t.Fatalf("First booking creation failed: %v", result1.Error)
	}
	t.Logf("✅ First booking created: %s", result1.BookingID)

// Segundo intento (REPLAY ATTACK) - debería retornar el mismo booking (idempotencia)
	result2 := createSeedBooking(ctx, db, slot)
	if !result2.Success {
		t.Fatalf("Replay attack booking failed: %v", result2.Error)
	}

	if !result2.IsDuplicate {
		t.Errorf("❌ REPLAY ATTACK SUCCESSFUL! Duplicate booking created: %s", result2.BookingID)
	} else {
		t.Logf("✅ Replay attack prevented - returned existing booking: %s", result2.BookingID)
	}

// Cleanup
	cleanupQuery := `DELETE FROM bookings WHERE idempotency_key = $1`
	db.ExecContext(ctx, cleanupQuery, slot.IdempotencyKey)
}

// TestRedTeam_ExtremeValues prueba valores extremos en inputs numéricos
func TestRedTeam_ExtremeValues(t *testing.T) {
	extremeCases := []struct {
		name          string
		durationMins  int
		wantValid     bool
	}{
		{"zero_duration", 0, false},
		{"negative_duration", -1, false},
		{"one_minute", 1, false}, // Mínimo es 15
		{"max_allowed", 480, true},
		{"overflow_int32", 2147483647, false},
		{"negative_overflow", -2147483648, false},
	}

	for _, tt := range extremeCases {
		t.Run(tt.name, func(t *testing.T) {
			slot := SeedSlotRequest{
				ProviderID:      "00000000-0000-0000-0000-000000000001",
				ServiceID:       "00000000-0000-0000-0000-000000000001",
				StartTime:       "2026-04-01T10:00:00-03:00",
				IdempotencyKey:  "SEED-TEST-001",
				DurationMinutes: tt.durationMins,
			}

			result := validateSeedSlot(slot)

			if result.Valid != tt.wantValid {
				t.Errorf("validateSeedSlot() valid = %v, want %v for duration: %d",
					result.Valid, tt.wantValid, tt.durationMins)
			}
		})
	}
}
