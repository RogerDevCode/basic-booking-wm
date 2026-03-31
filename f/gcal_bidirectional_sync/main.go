package inner

import (
	"context"
	"database/sql"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/infrastructure"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// GCalSyncInput representa el input para sincronización GCal
type GCalSyncInput struct {
	BookingID   string `json:"booking_id"`
	ProviderID  string `json:"provider_id"`
	ServiceID   string `json:"service_id"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	UserID      string `json:"user_id"`
	Status      string `json:"status"`
	GCalEventID string `json:"gcal_event_id,omitempty"`
	Action      string `json:"action"` // "create", "update", "delete", "sync_from_gcal"
}

// GCalSyncResult representa el resultado de la sincronización
type GCalSyncResult struct {
	Success       bool                   `json:"success"`
	GCalEventID   string                 `json:"gcal_event_id,omitempty"`
	GCalLink      string                 `json:"gcal_link,omitempty"`
	SyncDirection string                 `json:"sync_direction"` // "db_to_gcal", "gcal_to_db"
	Data          map[string]interface{} `json:"data,omitempty"`
	Error         string                 `json:"error,omitempty"`
}

// main ejecuta la sincronización bidireccional DB ↔ GCal
// LAW-13: DB is source of truth, GCal is synced copy
// SYNC-03: Every booking mutation → attempt GCal sync immediately
func main(input GCalSyncInput) (GCalSyncResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	source := "GCal_Bidirectional_Sync"
	version := "1.0.0"

	// Initialize DB with multiplexer
	database, err := db.GetDB(), error(nil)
	if database == nil {
		return GCalSyncResult{
			Success: false,
			Error:   "database: failed to initialize connection",
		}, nil
	}

	// Load GCal credentials
	gcalSvc, err := loadGCalService(ctx)
	if err != nil {
		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("gcal auth: %v", err),
		}, nil
	}

	// Execute sync based on action
	switch input.Action {
	case "create", "update":
		return syncDBToGCal(ctx, database, gcalSvc, input, source, version)
	case "delete", "cancel":
		return deleteGCalEvent(ctx, database, gcalSvc, input, source, version)
	case "sync_from_gcal":
		return syncGCalToDB(ctx, database, gcalSvc, input, source, version)
	default:
		return GCalSyncResult{
			Success: false,
			Error:   fmt.Sprintf("unknown action: %s", input.Action),
		}, nil
	}
}

// syncDBToGCal sincroniza desde DB hacia GCal (CREATE/UPDATE)
func syncDBToGCal(
	ctx context.Context,
	database *sql.DB,
	gcalSvc *calendar.Service,
	input GCalSyncInput,
	source string,
	version string,
) (GCalSyncResult, error) {
	// If already synced, skip
	if input.GCalEventID != "" {
		return GCalSyncResult{
			Success:       true,
			GCalEventID:   input.GCalEventID,
			SyncDirection: "db_to_gcal",
			Data: map[string]interface{}{
				"message": "Already synced",
			},
		}, nil
	}

	// Create GCal event
	title := fmt.Sprintf("Cita Médica - Servicio %s", input.ServiceID[:8])
	description := fmt.Sprintf(
		"Booking ID: %s\nProveedor: %s\nServicio: %s\nUsuario: %s",
		input.BookingID, input.ProviderID, input.ServiceID, input.UserID,
	)

	event := &calendar.Event{
		Summary:     title,
		Description: description,
		Start: &calendar.EventDateTime{
			DateTime: input.StartTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
		End: &calendar.EventDateTime{
			DateTime: input.EndTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
	}

	// Get calendar ID from multiplexer
	calendarID := infrastructure.GetCalendarID()
	if calendarID == "" {
		calendarID = "primary"
	}

	// Create event
	createdEvent, err := gcalSvc.Events.Insert(calendarID, event).Do()
	if err != nil {
		// Mark booking as gcal_sync_pending (LAW-13)
		markGCalPending(ctx, database, input.BookingID, err.Error())
		
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "db_to_gcal",
			Error:         fmt.Sprintf("gcal create: %v", err),
		}, nil
	}

	// Update DB with GCal event ID (LAW-13: DB is source of truth)
	err = updateBookingGCal(ctx, database, input.BookingID, createdEvent.Id)
	if err != nil {
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "db_to_gcal",
			Error:         fmt.Sprintf("db update: %v", err),
		}, nil
	}

	return GCalSyncResult{
		Success:       true,
		GCalEventID:   createdEvent.Id,
		GCalLink:      createdEvent.HtmlLink,
		SyncDirection: "db_to_gcal",
		Data: map[string]interface{}{
			"booking_id":  input.BookingID,
			"calendar_id": calendarID,
			"summary":     title,
		},
	}, nil
}

// deleteGCalEvent elimina evento de GCal (CANCEL/DELETE)
func deleteGCalEvent(
	ctx context.Context,
	database *sql.DB,
	gcalSvc *calendar.Service,
	input GCalSyncInput,
	source string,
	version string,
) (GCalSyncResult, error) {
	if input.GCalEventID == "" {
		// No GCal event to delete
		return GCalSyncResult{
			Success:       true,
			SyncDirection: "db_to_gcal",
			Data: map[string]interface{}{
				"message": "No GCal event to delete",
			},
		}, nil
	}

	calendarID := infrastructure.GetCalendarID()
	if calendarID == "" {
		calendarID = "primary"
	}

	// Delete from GCal
	err := gcalSvc.Events.Delete(calendarID, input.GCalEventID).Do()
	if err != nil {
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "db_to_gcal",
			Error:         fmt.Sprintf("gcal delete: %v", err),
		}, nil
	}

	// Update DB
	err = clearGCalEvent(ctx, database, input.BookingID)
	if err != nil {
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "db_to_gcal",
			Error:         fmt.Sprintf("db update: %v", err),
		}, nil
	}

	return GCalSyncResult{
		Success:       true,
		SyncDirection: "db_to_gcal",
		Data: map[string]interface{}{
			"message":      "GCal event deleted",
			"booking_id":   input.BookingID,
			"gcal_event_id": input.GCalEventID,
		},
	}, nil
}

// syncGCalToDB sincroniza desde GCal hacia DB (webhook triggers)
func syncGCalToDB(
	ctx context.Context,
	database *sql.DB,
	gcalSvc *calendar.Service,
	input GCalSyncInput,
	source string,
	version string,
) (GCalSyncResult, error) {
	if input.GCalEventID == "" {
		return GCalSyncResult{
			Success: false,
			Error:   "gcal_event_id is required for sync_from_gcal",
		}, nil
	}

	// Fetch event from GCal to verify status
	calendarID := infrastructure.GetCalendarID()
	if calendarID == "" {
		calendarID = "primary"
	}

	event, err := gcalSvc.Events.Get(calendarID, input.GCalEventID).Do()
	if err != nil {
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "gcal_to_db",
			Error:         fmt.Sprintf("gcal get: %v", err),
		}, nil
	}

	// Check if event was cancelled
	if event.Status == "cancelled" {
		// Update DB booking status
		err = cancelBookingFromGCal(ctx, database, input.GCalEventID)
		if err != nil {
			return GCalSyncResult{
				Success:       false,
				SyncDirection: "gcal_to_db",
				Error:         fmt.Sprintf("db cancel: %v", err),
			}, nil
		}

		return GCalSyncResult{
			Success:       true,
			SyncDirection: "gcal_to_db",
			Data: map[string]interface{}{
				"message":    "Booking cancelled from GCal",
				"gcal_event_id": input.GCalEventID,
			},
		}, nil
	}

	// Event is active - verify DB is in sync
	err = verifySyncStatus(ctx, database, input.GCalEventID, event)
	if err != nil {
		return GCalSyncResult{
			Success:       false,
			SyncDirection: "gcal_to_db",
			Error:         fmt.Sprintf("verify sync: %v", err),
		}, nil
	}

	return GCalSyncResult{
		Success:       true,
		SyncDirection: "gcal_to_db",
		Data: map[string]interface{}{
			"message":    "Sync verified",
			"gcal_event_id": input.GCalEventID,
			"status":     event.Status,
		},
	}, nil
}

// Helper functions

func loadGCalService(ctx context.Context) (*calendar.Service, error) {
	homeDir, _ := os.UserHomeDir()
	credsPath := filepath.Join(homeDir, ".secrets_wm", "booking-sa-key.json")
	credsJSON, err := ioutil.ReadFile(credsPath)
	if err != nil {
		return nil, fmt.Errorf("read credentials: %w", err)
	}

	creds, err := google.CredentialsFromJSON(ctx, credsJSON, calendar.CalendarEventsScope)
	if err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}

	return calendar.NewService(ctx, option.WithCredentials(creds))
}

func updateBookingGCal(ctx context.Context, db *sql.DB, bookingID, gcalEventID string) error {
	query := `
		UPDATE bookings 
		SET gcal_event_id = $1, 
			gcal_synced_at = NOW(),
			updated_at = NOW()
		WHERE id = $2
	`
	_, err := db.ExecContext(ctx, query, gcalEventID, bookingID)
	return err
}

func markGCalPending(ctx context.Context, db *sql.DB, bookingID, gcalError string) error {
	query := `
		UPDATE bookings 
		SET gcal_sync_status = 'pending',
			gcal_sync_error = $1,
			updated_at = NOW()
		WHERE id = $2
	`
	_, err := db.ExecContext(ctx, query, gcalError, bookingID)
	return err
}

func clearGCalEvent(ctx context.Context, db *sql.DB, bookingID string) error {
	query := `
		UPDATE bookings 
		SET gcal_event_id = NULL,
			gcal_synced_at = NULL,
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := db.ExecContext(ctx, query, bookingID)
	return err
}

func cancelBookingFromGCal(ctx context.Context, db *sql.DB, gcalEventID string) error {
	query := `
		UPDATE bookings 
		SET status = 'CANCELLED',
			cancellation_reason = 'GCal Event Cancelled',
			cancelled_at = NOW(),
			updated_at = NOW()
		WHERE gcal_event_id = $1
	`
	_, err := db.ExecContext(ctx, query, gcalEventID)
	return err
}

func verifySyncStatus(ctx context.Context, db *sql.DB, gcalEventID string, event *calendar.Event) error {
	// Verify DB booking exists and is active
	query := `
		SELECT id, status 
		FROM bookings 
		WHERE gcal_event_id = $1 
		AND status NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
	`
	
	var bookingID string
	var status string
	err := db.QueryRowContext(ctx, query, gcalEventID).Scan(&bookingID, &status)
	if err == sql.ErrNoRows {
		// Booking not found in DB but exists in GCal - potential data inconsistency
		return fmt.Errorf("booking exists in GCal but not in DB: %s", gcalEventID)
	}
	if err != nil {
		return fmt.Errorf("query failed: %w", err)
	}

	return nil
}
