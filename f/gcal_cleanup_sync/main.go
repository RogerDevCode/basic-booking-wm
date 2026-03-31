package inner

import (
	"context"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/utils"
)

// GCleanRequest represents a cleanup request
type GCleanRequest struct {
	Mode       string `json:"mode"`        // "full" or "selective"
	ProviderID string `json:"provider_id"` // Optional: specific provider
	ServiceID  string `json:"service_id"`  // Optional: specific service
	DateFrom   string `json:"date_from"`   // Optional: YYYY-MM-DD
	DateTo     string `json:"date_to"`     // Optional: YYYY-MM-DD
	DryRun     bool   `json:"dry_run"`     // If true, don't delete, just report
}

// GCleanResult represents the cleanup result
type GCleanResult struct {
	Success      bool                   `json:"success"`
	TotalGCal    int                    `json:"total_gcal_events"`
	TotalDB      int                    `json:"total_db_bookings"`
	Matched      int                    `json:"matched"`
	OrphanedGCal int                    `json:"orphaned_gcal"`
	OrphanedDB   int                    `json:"orphaned_db"`
	DeletedGCal  int                    `json:"deleted_gcal"`
	UpdatedDB    int                    `json:"updated_db"`
	Errors       []string               `json:"errors,omitempty"`
	Data         map[string]interface{} `json:"data,omitempty"`
}

// main performs GCal cleanup in sync with DB (SEED_CLEANUP workflow)
// This removes orphaned GCal events and updates orphaned DB bookings
func main(req GCleanRequest) (GCleanResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	// Validate request
	validation := validateCleanupRequest(req)
	if !validation.Valid {
		return GCleanResult{
			Success: false,
			Errors:  []string{validation.Message},
		}, nil
	}

	result := GCleanResult{
		Errors: make([]string, 0),
		Data: map[string]interface{}{
			"mode":        req.Mode,
			"dry_run":     req.DryRun,
			"provider_id": req.ProviderID,
			"service_id":  req.ServiceID,
			"date_from":   req.DateFrom,
			"date_to":     req.DateTo,
		},
	}

	// Get all GCal events (placeholder - implement with GCal API)
	gcalEvents, err := getGCalEvents(ctx, req)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to get GCal events: %v", err))
		result.Success = false
		return result, nil
	}

	result.TotalGCal = len(gcalEvents)

	// Get all DB bookings
	dbBookings, err := getDBBookings(ctx, req)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Failed to get DB bookings: %v", err))
		result.Success = false
		return result, nil
	}

	result.TotalDB = len(dbBookings)

	// Create maps for comparison
	gcalMap := make(map[string]bool)
	for _, event := range gcalEvents {
		gcalMap[event.EventID] = true
	}

	dbMap := make(map[string]bool)
	for _, booking := range dbBookings {
		if booking.GCalEventID != "" {
			dbMap[booking.GCalEventID] = true
		}
	}

	// Find orphaned GCal events (in GCal but not in DB)
	for eventID := range gcalMap {
		if !dbMap[eventID] {
			result.OrphanedGCal++

			if !req.DryRun {
				// Delete orphaned GCal event
				err := deleteGCalEvent(ctx, eventID)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to delete GCal event %s: %v", eventID, err))
				} else {
					result.DeletedGCal++
				}
			}
		} else {
			result.Matched++
		}
	}

	// Find orphaned DB bookings (in DB but not in GCal)
	for _, booking := range dbBookings {
		if booking.GCalEventID != "" && !gcalMap[booking.GCalEventID] {
			result.OrphanedDB++

			if !req.DryRun {
				// Update DB booking status
				err := updateOrphanedBooking(ctx, booking.BookingID)
				if err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("Failed to update DB booking %s: %v", booking.BookingID, err))
				} else {
					result.UpdatedDB++
				}
			}
		}
	}

	result.Success = true
	return result, nil
}

// validateCleanupRequest validates the cleanup request
func validateCleanupRequest(req GCleanRequest) utils.ValidationResult {
	if req.Mode != "full" && req.Mode != "selective" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "mode must be 'full' or 'selective'",
		}
	}

	if req.Mode == "selective" {
		if req.ProviderID == "" && req.ServiceID == "" {
			return utils.ValidationResult{
				Valid:   false,
				Error:   "INVALID_INPUT",
				Message: "selective mode requires provider_id or service_id",
			}
		}

		if req.ProviderID != "" {
			validation := utils.ValidateUUID(req.ProviderID, "provider_id")
			if !validation.Valid {
				return validation
			}
		}

		if req.ServiceID != "" {
			validation := utils.ValidateUUID(req.ServiceID, "service_id")
			if !validation.Valid {
				return validation
			}
		}
	}

	if req.DateFrom != "" {
		validation := utils.ValidateISODateTime(req.DateFrom+"T00:00:00", "date_from")
		if !validation.Valid {
			return validation
		}
	}

	if req.DateTo != "" {
		validation := utils.ValidateISODateTime(req.DateTo+"T23:59:59", "date_to")
		if !validation.Valid {
			return validation
		}
	}

	return utils.ValidationResult{Valid: true}
}

// GCalEvent represents a Google Calendar event
type GCalEvent struct {
	EventID   string
	Summary   string
	StartTime time.Time
	EndTime   time.Time
	Status    string
}

// Booking represents a booking from DB
type Booking struct {
	BookingID   string
	ProviderID  string
	ServiceID   string
	GCalEventID string
	Status      string
	StartTime   time.Time
}

// getGCalEvents retrieves events from Google Calendar
func getGCalEvents(ctx context.Context, req GCleanRequest) ([]GCalEvent, error) {
	// TODO: Implement with Google Calendar API
	// Use credentials from ~/.secrets_wm/booking-sa-key.json or Windmill resource
	// For now, return empty slice
	return []GCalEvent{}, nil
}

// getDBBookings retrieves bookings from database
func getDBBookings(ctx context.Context, req GCleanRequest) ([]Booking, error) {
	query := `
		SELECT booking_id, provider_id, service_id, gcal_event_id, status, start_time
		FROM bookings
		WHERE 1=1
	`

	args := []interface{}{}
	argIndex := 1

	if req.Mode == "selective" {
		if req.ProviderID != "" {
			query += fmt.Sprintf(" AND provider_id = $%d", argIndex)
			args = append(args, req.ProviderID)
			argIndex++
		}

		if req.ServiceID != "" {
			query += fmt.Sprintf(" AND service_id = $%d", argIndex)
			args = append(args, req.ServiceID)
			argIndex++
		}
	}

	if req.DateFrom != "" {
		query += fmt.Sprintf(" AND start_time >= $%d", argIndex)
		args = append(args, req.DateFrom)
		argIndex++
	}

	if req.DateTo != "" {
		query += fmt.Sprintf(" AND start_time <= $%d", argIndex)
		args = append(args, req.DateTo)
		argIndex++
	}

	query += " ORDER BY start_time DESC"

	rows, err := db.GetDB().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bookings := make([]Booking, 0)
	for rows.Next() {
		var b Booking
		err := rows.Scan(&b.BookingID, &b.ProviderID, &b.ServiceID, &b.GCalEventID, &b.Status, &b.StartTime)
		if err != nil {
			return nil, err
		}
		bookings = append(bookings, b)
	}

	return bookings, nil
}

// deleteGCalEvent deletes a Google Calendar event
func deleteGCalEvent(ctx context.Context, eventID string) error {
	// TODO: Implement with Google Calendar API
	// calendarService.Events.Delete(calendarID, eventID).Do()
	return nil
}

// updateOrphanedBooking updates a booking that has no matching GCal event
func updateOrphanedBooking(ctx context.Context, bookingID string) error {
	query := `
		UPDATE bookings 
		SET 
			status = 'CANCELLED',
			cancellation_reason = 'GCal event not found',
			gcal_sync_status = 'failed',
			updated_at = NOW()
		WHERE booking_id = $1
	`

	_, err := db.GetDB().ExecContext(ctx, query, bookingID)
	return err
}
