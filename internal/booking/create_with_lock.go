package booking

import (
	"context"
	"database/sql"
	"fmt"
	"hash/crc64"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
)

// CreateBookingWithLock crea una reserva con advisory lock para prevenir race conditions
func CreateBookingWithLock(
	ctx context.Context,
	req types.CreateBookingRequest,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Create_Booking_With_Lock"
	version := "1.1.0"
	now := time.Now().UTC()

	// Inicializar DB
	database := db.GetDB()
	if database == nil {
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr("database: failed to initialize connection"),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// Generar lock key consistente desde provider + time
	lockKey := fmt.Sprintf("booking:%s:%s", req.ProviderID, req.StartTime)
	lockKeyHash := int64(crc64.Checksum([]byte(lockKey), crc64.MakeTable(crc64.ECMA)))

	// Adquirir advisory lock (auto-release en transaction end)
	lockQuery := `SELECT pg_advisory_xact_lock($1)`
	_, err := database.ExecContext(ctx, lockQuery, lockKeyHash)
	if err != nil {
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("lock: acquisition failed: %v", err)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// Ahora es seguro verificar disponibilidad e insertar
	return createBookingInTransaction(ctx, database, req, source, version)
}

// createBookingInTransaction ejecuta la creación de booking en transacción
func createBookingInTransaction(
	ctx context.Context,
	database *sql.DB,
	req types.CreateBookingRequest,
	source string,
	version string,
) types.StandardContractResponse[map[string]any] {
	now := time.Now().UTC()

	// Iniciar transacción
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("tx: begin failed: %v", err)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// Deferred rollback
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		}
	}()

	// 1. Validar inputs
	validation := validateBookingRequest(req)
	if !validation.Valid {
		tx.Rollback()
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorCode:    strPtr(validation.Error),
			ErrorMessage: strPtr(fmt.Sprintf("validation: %s", validation.Message)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// 2. Verificar disponibilidad (con lock ya adquirido)
	available, err := checkAvailabilityWithLock(ctx, tx, req.ProviderID, req.StartTime, "")
	if err != nil {
		tx.Rollback()
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("availability: check failed: %v", err)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	if !available {
		tx.Rollback()
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorCode:    strPtr("SLOT_UNAVAILABLE"),
			ErrorMessage: strPtr("This time slot is no longer available. Please select another."),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// 3. Insertar booking
	bookingID, isNew, err := insertBooking(ctx, tx, req)
	if err != nil {
		tx.Rollback()

		// Check for exclusion constraint violation
		if isExclusionViolation(err) {
			return types.StandardContractResponse[map[string]any]{
				Success:      false,
				ErrorCode:    strPtr("BOOKING_CONFLICT"),
				ErrorMessage: strPtr("This time slot is no longer available. Please select another."),
				Meta: types.ResponseMetadata{
					Source:    source,
					Timestamp: now.Format(time.RFC3339),
					Version:   version,
				},
			}
		}

		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("insert: failed: %v", err)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// 4. Commit
	err = tx.Commit()
	if err != nil {
		return types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("tx: commit failed: %v", err)),
			Meta: types.ResponseMetadata{
				Source:    source,
				Timestamp: now.Format(time.RFC3339),
				Version:   version,
			},
		}
	}

	// 5. Retornar éxito
	data := map[string]any{
		"id":          bookingID,
		"is_new":      isNew,
		"provider_id": req.ProviderID,
		"service_id":  req.ServiceID,
		"start_time":  req.StartTime,
		"end_time":    req.StartTime + " + 1 hour",  // Calculated in DB
		"status":      types.StatusConfirmed,
		"user_id":     req.ChatID,
	}

	return types.StandardContractResponse[map[string]any]{
		Success: true,
		Data:    &data,
		Meta: types.ResponseMetadata{
			Source:    source,
			Timestamp: now.Format(time.RFC3339),
			Version:   version,
		},
	}
}

// validateBookingRequest valida el request de booking
func validateBookingRequest(req types.CreateBookingRequest) ValidationResult {
	if req.ProviderID == "" {
		return ValidationResult{Valid: false, Error: "INVALID_INPUT", Message: "provider_id is required"}
	}
	if req.ServiceID == "" {
		return ValidationResult{Valid: false, Error: "INVALID_INPUT", Message: "service_id is required"}
	}
	if req.StartTime == "" {
		return ValidationResult{Valid: false, Error: "INVALID_INPUT", Message: "start_time is required"}
	}
	if req.ChatID == "" {
		return ValidationResult{Valid: false, Error: "INVALID_INPUT", Message: "chat_id is required"}
	}
	return ValidationResult{Valid: true}
}

// ValidationResult es el resultado de validación
type ValidationResult struct {
	Valid   bool
	Error   string
	Message string
}

// checkAvailabilityWithLock verifica disponibilidad
func checkAvailabilityWithLock(
	ctx context.Context,
	tx *sql.Tx,
	providerID string,
	startTime string,
	endTime string,
) (bool, error) {
	// Calcular end_time as start_time + 1 hour by default
	query := `
		SELECT COUNT(*)
		FROM bookings
		WHERE provider_id = $1
		  AND start_time < $2
		  AND end_time > $2
		  AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
	`

	var count int
	err := tx.QueryRowContext(ctx, query, providerID, startTime, startTime).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("availability query failed: %w", err)
	}

	return count == 0, nil
}

// insertBooking inserta el booking
func insertBooking(
	ctx context.Context,
	tx *sql.Tx,
	req types.CreateBookingRequest,
) (string, bool, error) {
	// Generate idempotency key from request data
	idempotencyKey := fmt.Sprintf("booking:%s:%s:%s", req.ProviderID, req.ServiceID, req.StartTime)
	
	// Calculate end_time as start_time + 1 hour
	endTimeQuery := `SELECT ($1::timestamptz + INTERVAL '1 hour')`
	var endTime string
	err := tx.QueryRowContext(ctx, endTimeQuery, req.StartTime).Scan(&endTime)
	if err != nil {
		endTime = req.StartTime // Fallback
	}
	
	query := `
		INSERT INTO bookings (
			provider_id,
			service_id,
			start_time,
			end_time,
			status,
			idempotency_key,
			user_id,
			created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (idempotency_key) DO UPDATE
		SET updated_at = NOW()
		RETURNING id, (xmax = 0) as is_new
	`

	var bookingID string
	var isNew bool
	err = tx.QueryRowContext(
		ctx,
		query,
		req.ProviderID,
		req.ServiceID,
		req.StartTime,
		endTime,
		types.StatusConfirmed,
		idempotencyKey,
		req.ChatID,
	).Scan(&bookingID, &isNew)

	if err != nil {
		return "", false, fmt.Errorf("insert failed: %w", err)
	}

	return bookingID, isNew, nil
}

// isExclusionViolation verifica si el error es de exclusion constraint
func isExclusionViolation(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return containsString(errStr, "23P01") ||
		containsString(errStr, "exclusion_violation") ||
		containsString(errStr, "booking_no_overlap")
}

func containsString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func strPtr(s string) *string {
	return &s
}
