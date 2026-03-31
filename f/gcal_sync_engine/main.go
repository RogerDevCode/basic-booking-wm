package inner

import (
	"context"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
)

// GCalSyncEvent represents a Google Calendar event webhook payload
type GCalSyncEvent struct {
	EventID    string `json:"event_id"`
	Status     string `json:"status"` // confirmed, cancelled, etc.
	CalendarID string `json:"calendar_id"`
	Source     string `json:"source"` // google_apps_script, webhook, etc.
}

// GCalSyncResult represents the result of GCal sync operation
type GCalSyncResult struct {
	Success   bool                   `json:"success"`
	Action    string                 `json:"action"` // booking_cancelled, sync_updated, no_action
	BookingID string                 `json:"booking_id,omitempty"`
	EventID   string                 `json:"event_id"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// main handles GCal event sync (WF4_Sync_Engine_Event_Driven equivalent)
// This script is called when a GCal event is created/updated/cancelled
func main(event GCalSyncEvent) (GCalSyncResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Validate source
	if event.Source != "google_apps_script" && event.Source != "webhook" {
		return GCalSyncResult{
			Success: false,
			Error:   "Unauthorized source",
			EventID: event.EventID,
		}, nil
	}

	// Validate event ID
	if event.EventID == "" {
		return GCalSyncResult{
			Success: false,
			Error:   "Missing event_id",
		}, nil
	}

	// Route based on event status
	if event.Status == "cancelled" {
		return handleCancelledEvent(ctx, event)
	}

	// For confirmed/updated events, update sync status
	return handleUpdatedEvent(ctx, event)
}

// handleCancelledEvent handles cancelled GCal events
func handleCancelledEvent(ctx context.Context, event GCalSyncEvent) (GCalSyncResult, error) {
	// Update booking in database
	query := `
		UPDATE bookings 
		SET 
			status = 'CANCELLED',
			cancelled_at = NOW(),
			cancellation_reason = 'GCal Event Deleted',
			updated_at = NOW()
		WHERE gcal_event_id = $1 
		  AND status != 'CANCELLED'
		RETURNING booking_id, user_id
	`

	var bookingID string
	var userID string
	err := db.GetDB().QueryRowContext(ctx, query, event.EventID).Scan(&bookingID, &userID)

	if err != nil {
		if err.Error() == "no rows in result set" {
			// No booking found with this GCal event ID
			return GCalSyncResult{
				Success: true,
				Action:  "no_booking_found",
				EventID: event.EventID,
				Data: map[string]interface{}{
					"message": "No booking found for this GCal event",
				},
			}, nil
		}

		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("DB error: %v", err),
			EventID: event.EventID,
		}, nil
	}

	// Log the cancellation in audit trail
	logCancellation(ctx, bookingID, userID, event.EventID)

	return GCalSyncResult{
		Success:   true,
		Action:    "booking_cancelled",
		BookingID: bookingID,
		EventID:   event.EventID,
		Data: map[string]interface{}{
			"user_id":         userID,
			"cancelled_at":    time.Now().UTC().Format(time.RFC3339),
			"reason":          "GCal Event Deleted",
		},
	}, nil
}

// handleUpdatedEvent handles updated/confirmed GCal events
func handleUpdatedEvent(ctx context.Context, event GCalSyncEvent) (GCalSyncResult, error) {
	// Update sync status in database
	query := `
		UPDATE bookings 
		SET 
			gcal_synced_at = NOW(),
			status = CASE 
				WHEN status = 'PENDING' THEN 'CONFIRMED' 
				ELSE status 
			END,
			updated_at = NOW()
		WHERE gcal_event_id = $1
		RETURNING booking_id
	`

	var bookingID string
	err := db.GetDB().QueryRowContext(ctx, query, event.EventID).Scan(&bookingID)

	if err != nil {
		if err.Error() == "no rows in result set" {
			// No booking found with this GCal event ID
			return GCalSyncResult{
				Success: true,
				Action:  "no_booking_found",
				EventID: event.EventID,
				Data: map[string]interface{}{
					"message": "No booking found for this GCal event",
				},
			}, nil
		}

		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("DB error: %v", err),
			EventID: event.EventID,
		}, nil
	}

	return GCalSyncResult{
		Success:   true,
		Action:    "sync_updated",
		BookingID: bookingID,
		EventID:   event.EventID,
		Data: map[string]interface{}{
			"synced_at": time.Now().UTC().Format(time.RFC3339),
			"status":    "confirmed",
		},
	}, nil
}

// logCancellation logs the cancellation in the audit trail
func logCancellation(ctx context.Context, bookingID, userID, eventID string) {
	query := `
		INSERT INTO booking_audit (
			booking_id,
			from_status,
			to_status,
			changed_by,
			actor_id,
			reason,
			metadata,
			created_at
		) VALUES ($1, 'CONFIRMED', 'CANCELLED', 'system', $2, 'GCal event deleted', $3, NOW())
	`

	metadata := map[string]interface{}{
		"gcal_event_id": eventID,
		"source":        "WF4_Sync_Engine",
	}

	db.GetDB().ExecContext(ctx, query, bookingID, userID, metadata)
}
