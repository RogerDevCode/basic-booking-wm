package inner

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/infrastructure"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"

	"google.golang.org/api/calendar/v3"
)

// SeedSlotRequest represents a single slot to seed
type SeedSlotRequest struct {
	ProviderID      string `json:"provider_id"`
	ServiceID       string `json:"service_id"`
	StartTime       string `json:"start_time"`
	EndTime         string `json:"end_time"`
	ChatID          string `json:"chat_id"`
	IdempotencyKey  string `json:"idempotency_key"`
	DurationMinutes int    `json:"duration_minutes"`
	Source          string `json:"source"`
}

// SeedSlotResult represents the result of seeding a single slot
type SeedSlotResult struct {
	Success        bool                   `json:"success"`
	BookingID      string                 `json:"booking_id,omitempty"`
	IdempotencyKey string                 `json:"idempotency_key"`
	IsDuplicate    bool                   `json:"is_duplicate"`
	Error          string                 `json:"error,omitempty"`
	Data           map[string]interface{} `json:"data,omitempty"`
}

// main seeds a single booking slot (called by SEED_01 flow)
// This is the Windmill equivalent of SEED_01_Process_Slot
func main(slot SeedSlotRequest) (SeedSlotResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialize DB with multiplexer
	db, err := infrastructure.InicializarBaseDatos()
	if err != nil {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          fmt.Sprintf("DB init failed: %v", err),
		}, nil
	}
	defer db.Close()

	// Validate slot
	validation := validateSeedSlot(slot)
	if !validation.Valid {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          validation.Message,
		}, nil
	}

	// Check availability first
	availCheck := checkSlotAvailability(ctx, db, slot)
	if !availCheck.Available {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          "Slot not available",
			Data: map[string]interface{}{
				"reason": availCheck.Reason,
			},
		}, nil
	}

	// Acquire distributed lock
	lockKey := fmt.Sprintf("lock:%s:%s", slot.ProviderID, slot.StartTime)
	lockResult := acquireLock(ctx, db, lockKey, slot.IdempotencyKey)
	if !lockResult.Acquired {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          "Failed to acquire lock",
			IsDuplicate:    lockResult.IsDuplicate,
		}, nil
	}
	defer releaseLock(ctx, db, lockKey, lockResult.OwnerToken)

	// Create booking
	bookingResult := createSeedBooking(ctx, db, slot)
	if !bookingResult.Success {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          bookingResult.Error,
		}, nil
	}

	// Sync to Google Calendar (mark as synced)
	gcalResult := syncToGCal(ctx, db, bookingResult.BookingID)
	if !gcalResult.Success {
		// Log but don't fail - GCal sync is async (LAW-13: GCAL SYNC INVARIANT)
		fmt.Printf("GCal sync failed but booking created: %v\n", gcalResult.Error)
	}

	return SeedSlotResult{
		Success:        true,
		BookingID:      bookingResult.BookingID,
		IdempotencyKey: slot.IdempotencyKey,
		IsDuplicate:    bookingResult.IsDuplicate,
		Data: map[string]interface{}{
			"provider_id": slot.ProviderID,
			"service_id":  slot.ServiceID,
			"start_time":  slot.StartTime,
			"gcal_synced": gcalResult.Success,
		},
	}, nil
}

// validateSeedSlot validates the seed slot request
func validateSeedSlot(slot SeedSlotRequest) utils.ValidationResult {
	if slot.ProviderID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "provider_id is required",
		}
	}

	if slot.ServiceID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "service_id is required",
		}
	}

	if slot.StartTime == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "start_time is required",
		}
	}

	// Validate ISO datetime
	timeValidation := utils.ValidateISODateTime(slot.StartTime, "start_time")
	if !timeValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   timeValidation.Error,
			Message: timeValidation.Message,
		}
	}

	if slot.IdempotencyKey == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "idempotency_key is required",
		}
	}

	return utils.ValidationResult{Valid: true}
}

// checkSlotAvailability checks if the slot is available
func checkSlotAvailability(ctx context.Context, db *sql.DB, slot SeedSlotRequest) AvailabilityCheck {
	query := `
		SELECT COUNT(*)
		FROM bookings
		WHERE provider_id = $1
		  AND start_time <= $2
		  AND end_time >= $3
		  AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
	`

	var count int
	err := db.QueryRowContext(ctx, query, slot.ProviderID, slot.StartTime, slot.EndTime).Scan(&count)
	if err != nil {
		return AvailabilityCheck{
			Available: false,
			Reason:    fmt.Sprintf("DB error: %v", err),
		}
	}

	if count > 0 {
		return AvailabilityCheck{
			Available: false,
			Reason:    "Slot already booked",
		}
	}

	return AvailabilityCheck{
		Available: true,
	}
}

// AvailabilityCheck represents availability check result
type AvailabilityCheck struct {
	Available bool
	Reason    string
}

// acquireLock acquires a distributed lock
func acquireLock(ctx context.Context, db *sql.DB, lockKey, ownerToken string) LockResult {
	// Try to insert new lock or update if expired
	query := `
		INSERT INTO booking_locks (lock_key, owner_token, acquired_at, expires_at)
		VALUES ($1, $2, NOW(), NOW() + INTERVAL '5 minutes')
		ON CONFLICT (lock_key) DO UPDATE
		SET owner_token = EXCLUDED.owner_token, acquired_at = NOW(), expires_at = EXCLUDED.expires_at
		WHERE booking_locks.expires_at < NOW()
		RETURNING owner_token, (acquired_at IS NOT NULL) as is_new
	`

	var token string
	var isNew bool
	err := db.QueryRowContext(ctx, query, lockKey, ownerToken).Scan(&token, &isNew)
	if err != nil {
		// If no rows returned, lock exists and is not expired
		// Fetch the existing lock owner
		fetchQuery := `SELECT owner_token FROM booking_locks WHERE lock_key = $1`
		fetchErr := db.QueryRowContext(ctx, fetchQuery, lockKey).Scan(&token)
		if fetchErr != nil {
			return LockResult{
				Acquired: false,
				Error:    fmt.Sprintf("acquireLock.fetch: %v", err),
			}
		}
		// Lock is held by someone else
		return LockResult{
			Acquired:    false,
			OwnerToken:  token,
			IsDuplicate: true,
		}
	}

	return LockResult{
		Acquired:    true,
		OwnerToken:  token,
		IsDuplicate: !isNew,
	}
}

// LockResult represents lock acquisition result
type LockResult struct {
	Acquired    bool
	OwnerToken  string
	IsDuplicate bool
	Error       string
}

// releaseLock releases a distributed lock
func releaseLock(ctx context.Context, db *sql.DB, lockKey, ownerToken string) {
	query := `DELETE FROM booking_locks WHERE lock_key = $1 AND owner_token = $2`
	db.ExecContext(ctx, query, lockKey, ownerToken)
}

// createSeedBooking creates a booking for seed operations
func createSeedBooking(ctx context.Context, db *sql.DB, slot SeedSlotRequest) BookingResult {
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
	err := db.QueryRowContext(
		ctx,
		query,
		slot.ProviderID,
		slot.ServiceID,
		slot.StartTime,
		slot.EndTime,
		types.StatusConfirmed,
		slot.IdempotencyKey,
		slot.ChatID,
	).Scan(&bookingID, &isNew)

	if err != nil {
		return BookingResult{
			Success: false,
			Error:   err.Error(),
		}
	}

	return BookingResult{
		Success:     true,
		BookingID:   bookingID,
		IsDuplicate: !isNew,
	}
}

// BookingResult represents booking creation result
type BookingResult struct {
	Success     bool
	BookingID   string
	IsDuplicate bool
	Error       string
}

// syncToGCal creates a real Google Calendar event and updates the booking with the event ID
func syncToGCal(ctx context.Context, db *sql.DB, bookingID string) GCalSyncResult {
	// 1. Fetch booking details to build the GCal event
	fetchQuery := `
		SELECT start_time, provider_id, service_id
		FROM bookings
		WHERE id = $1
	`
	var startTime time.Time
	var providerID, serviceID string
	err := db.QueryRowContext(ctx, fetchQuery, bookingID).Scan(&startTime, &providerID, &serviceID)
	if err != nil {
		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("syncToGCal.fetchBooking: %v", err),
		}
	}

	// 2. Create real GCal event via infrastructure package
	startTimeStr := startTime.Format(time.RFC3339)
	title := fmt.Sprintf("Reserva Seed - Servicio %s", serviceID)
	description := fmt.Sprintf("Proveedor: %s\nBooking ID: %s\nCreado por: seed_process_slot", providerID, bookingID)

	// Get calendar ID from multiplexer
	calendarID := infrastructure.GetCalendarID()
	
	// Create GCal event using infrastructure
	gcalErr := createGCalEvent(ctx, calendarID, startTimeStr, title, description)
	if gcalErr != nil {
		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("syncToGCal.createEvent: %v", gcalErr),
		}
	}

	// 3. Update booking with sync status (LAW-13: DB is source of truth)
	updateQuery := `
		UPDATE bookings 
		SET gcal_synced_at = NOW(),
			status = CASE WHEN status = 'PENDING' THEN 'CONFIRMED' ELSE status END
		WHERE id = $1
	`
	_, updateErr := db.ExecContext(ctx, updateQuery, bookingID)
	if updateErr != nil {
		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("syncToGCal.updateDB: %v", updateErr),
		}
	}

	return GCalSyncResult{
		Success: true,
	}
}

// createGCalEvent creates a Google Calendar event using infrastructure
func createGCalEvent(ctx context.Context, calendarID, startTime, title, description string) error {
	// Initialize GCal client with multiplexer
	gcalSvc, err := infrastructure.InicializarClienteGCal(ctx)
	if err != nil {
		return fmt.Errorf("failed to init GCal client: %w", err)
	}

	// Parse times
	startTimeParsed, _ := time.Parse(time.RFC3339, startTime)
	endTimeParsed := startTimeParsed.Add(time.Hour)

	event := &calendar.Event{
		Summary:     title,
		Description: description,
		Start: &calendar.EventDateTime{
			DateTime: startTimeParsed.Format(time.RFC3339),
			TimeZone: "America/Argentina/Buenos_Aires",
		},
		End: &calendar.EventDateTime{
			DateTime: endTimeParsed.Format(time.RFC3339),
			TimeZone: "America/Argentina/Buenos_Aires",
		},
	}

	_, err = gcalSvc.Events.Insert(calendarID, event).Do()
	if err != nil {
		return fmt.Errorf("GCal API error: %w", err)
	}

	return nil
}

// GCalSyncResult represents GCal sync result
type GCalSyncResult struct {
	Success bool
	Error   string
}

