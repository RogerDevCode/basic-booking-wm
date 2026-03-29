package booking

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/communication"
	"booking-titanium-wm/pkg/logging"
	"booking-titanium-wm/pkg/types"
)

var cronLog = logging.GetDefaultLogger()

// ============================================================================
// CRON JOB RESULTS
// ============================================================================

// NoShowResult represents the result of the no-show marking cron
type NoShowResult struct {
	MarkedNoShow int `json:"marked_no_show"`
	Errors       int `json:"errors"`
	Timestamp    string `json:"timestamp"`
}

// GCalReconciliationResult represents the result of GCal reconciliation cron
type GCalReconciliationResult struct {
	Processed  int `json:"processed"`
	Succeeded  int `json:"succeeded"`
	Failed     int `json:"failed"`
	Timestamp  string `json:"timestamp"`
}

// ============================================================================
// NO-SHOW MARKING CRON (v4.0 §8)
// ============================================================================

// MarkNoShows is a cron job that marks past confirmed bookings as no-show
// Schedule: 0 1 * * * (daily at 1:00 AM)
func MarkNoShows() (*NoShowResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result := &NoShowResult{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	cronLog.Info("Starting no-show marking cron job")

	// Query past confirmed bookings (more than 2 hours ago)
	query := `
		SELECT booking_id, patient_id, provider_id, start_time
		FROM bookings
		WHERE status = 'confirmed'
		  AND start_time < NOW() - INTERVAL '2 hours'
		  AND DATE(start_time) < CURRENT_DATE
		LIMIT 100`

	rows, err := db.GetDB().QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("noshow.query: failed: %w", err)
	}
	defer rows.Close()

	marked := 0
	errors := 0

	for rows.Next() {
		var bookingID string
		var patientID, providerID sql.NullString
		var startTime time.Time

		err := rows.Scan(&bookingID, &patientID, &providerID, &startTime)
		if err != nil {
			cronLog.Error("Failed to scan booking: %v", err)
			errors++
			continue
		}

		// Mark as no-show
		err = markAsNoShow(ctx, bookingID, providerID.String)
		if err != nil {
			cronLog.Error("Failed to mark no-show: booking_id=%s, error=%v", bookingID, err)
			errors++
			continue
		}

		marked++
		cronLog.Info("Marked as no-show: booking_id=%s start_time=%s", bookingID, startTime.Format("2006-01-02"))

		// Send notification to patient (email)
		if patientID.Valid {
			sendNoShowNotification(ctx, bookingID, patientID.String)
		}
	}

	result.MarkedNoShow = marked
	result.Errors = errors

	cronLog.Info("No-show marking completed: marked=%d, errors=%d", marked, errors)

	return result, nil
}

// markAsNoShow marks a booking as no-show
func markAsNoShow(ctx context.Context, bookingID, providerID string) error {
	query := `
		UPDATE bookings
		SET status = 'no_show', updated_at = NOW()
		WHERE booking_id = $1`

	_, err := db.GetDB().ExecContext(ctx, query, bookingID)
	if err != nil {
		return fmt.Errorf("noshow.update: failed: %w", err)
	}

	// Create audit trail
	fromStatus := types.StatusConfirmed
	_, err = CreateAuditEntry(
		ctx,
		nil, // tx (using direct DB connection)
		bookingID,
		&fromStatus,
		types.StatusNoShow,
		"system",
		nil, // actor_id
		ptr("Automated no-show marking (appointment date passed)"),
		map[string]any{
			"cron_job": "mark_no_shows",
			"marked_at": time.Now().UTC().Format(time.RFC3339),
		},
	)
	if err != nil {
		cronLog.Warn("Failed to create audit entry for no-show: booking_id=%s, error=%v", bookingID, err)
	}

	return nil
}

// sendNoShowNotification sends a notification email to the patient
func sendNoShowNotification(ctx context.Context, bookingID, patientID string) {
	// Get patient email
	query := `SELECT email, name FROM patients WHERE patient_id = $1`
	
	var email, name sql.NullString
	err := db.GetDB().QueryRowContext(ctx, query, patientID).Scan(&email, &name)
	if err != nil || !email.Valid {
		cronLog.Warn("Cannot send no-show notification: booking_id=%s, error=%v", bookingID, err)
		return
	}

	// Send email
	subject := "Información sobre tu cita médica"
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Información sobre tu Cita</h1>
        </div>
        <div class="content">
            <p>Hola %s,</p>
            <p>Notamos que no asististe a tu cita médica programada.</p>
            
            <p><strong>ID de cita:</strong> %s</p>
            
            <p>Entendemos que los imprevistos ocurren. Te invitamos a reagendar tu cita lo antes posible.</p>
            
            <p>Para reagendar:</p>
            <ul>
                <li>Responde a este correo</li>
                <li>O escríbenos por Telegram</li>
                <li>O llama a nuestra oficina</li>
            </ul>
            
            <p><strong>Política de no-show:</strong> Las citas no atendidas pueden tener un cargo según el tipo de servicio.</p>
        </div>
        <div class="footer">
            <p>Booking Titanium - Sistema de Gestión de Citas Médicas</p>
        </div>
    </div>
</body>
</html>`,
		name.String,
		bookingID,
	)

	resp := communication.SendEmailWithRetry(email.String, subject, body, true)

	if resp.Success {
		cronLog.Info("No-show notification sent: booking_id=%s email=%s", bookingID, email.String)
	} else {
		cronLog.Error("No-show notification failed: booking_id=%s", bookingID)
	}
}

// ============================================================================
// GCAL RECONCILIATION CRON (v4.0 SYNC-05)
// ============================================================================

// ReconcileGCalSync is a cron job that reconciles pending GCal syncs
// Schedule: */5 * * * * (every 5 minutes)
func ReconcileGCalSync() (*GCalReconciliationResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	result := &GCalReconciliationResult{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	cronLog.Info("Starting GCal reconciliation cron job")

	// Query bookings with pending/partial sync
	query := `
		SELECT 
			booking_id,
			patient_id,
			provider_id,
			start_time,
			end_time,
			gcal_sync_status,
			gcal_retry_count
		FROM bookings
		WHERE gcal_sync_status IN ('pending', 'partial')
		  AND gcal_retry_count < 10
		ORDER BY created_at ASC
		LIMIT 50`

	rows, err := db.GetDB().QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("gcal.reconcile.query: failed: %w", err)
	}
	defer rows.Close()

	processed := 0
	succeeded := 0
	failed := 0

	for rows.Next() {
		var bookingID, startTime, endTime string
		var patientID, providerID sql.NullString
		var syncStatus string
		var retryCount int

		err := rows.Scan(
			&bookingID,
			&patientID,
			&providerID,
			&startTime,
			&endTime,
			&syncStatus,
			&retryCount,
		)
		if err != nil {
			cronLog.Error("Failed to scan booking: %v", err)
			failed++
			continue
		}

		processed++

		// Attempt sync
		err = reconcileBookingGCal(ctx, bookingID, patientID.String, providerID.String, startTime, endTime)
		if err != nil {
			cronLog.Error("GCal reconciliation failed: booking_id=%s, error=%v", bookingID, err)
			failed++
		} else {
			cronLog.Info("GCal reconciliation succeeded: booking_id=%s", bookingID)
			succeeded++
		}
	}

	result.Processed = processed
	result.Succeeded = succeeded
	result.Failed = failed

	cronLog.Info("GCal reconciliation completed: processed=%d, succeeded=%d, failed=%d",
		processed, succeeded, failed)

	return result, nil
}

// reconcileBookingGCal attempts to sync a booking to GCal
func reconcileBookingGCal(ctx context.Context, bookingID, patientID, providerID, startTime, endTime string) error {
	// Get GCal credentials from resource
	// Note: In production, fetch from Windmill resources
	credentialsJSON := "" // TODO: Fetch from resource
	
	if credentialsJSON == "" {
		cronLog.Warn("GCal credentials not configured, skipping reconciliation")
		return nil
	}

	// Get patient and provider calendar IDs
	patientCalendarID, providerCalendarID, err := getCalendarIDs(ctx, patientID, providerID)
	if err != nil {
		return fmt.Errorf("gcal.reconcile.calendar_ids: %w", err)
	}

	// Sync to GCal
	result, err := communication.SyncBookingToGCal(
		credentialsJSON,
		providerCalendarID,
		patientCalendarID,
		"Cita Médica",
		fmt.Sprintf("Booking ID: %s", bookingID),
		startTime,
		endTime,
		"America/Mexico_City",
	)
	if err != nil {
		// Increment retry count
		incrementGCalRetryCount(ctx, bookingID)
		return err
	}

	// Update booking with GCal info
	err = updateBookingGCalInfo(ctx, bookingID, result)
	if err != nil {
		return fmt.Errorf("gcal.reconcile.update: %w", err)
	}

	return nil
}

// getCalendarIDs gets the calendar IDs for patient and provider
func getCalendarIDs(ctx context.Context, patientID, providerID string) (string, string, error) {
	var patientCalendarID, providerCalendarID sql.NullString

	// Get patient calendar
	if patientID != "" {
		query := `SELECT gcal_calendar_id FROM patients WHERE patient_id = $1`
		db.GetDB().QueryRowContext(ctx, query, patientID).Scan(&patientCalendarID)
	}

	// Get provider calendar
	if providerID != "" {
		query := `SELECT gcal_calendar_id FROM providers WHERE provider_id = $1`
		db.GetDB().QueryRowContext(ctx, query, providerID).Scan(&providerCalendarID)
	}

	// Use "primary" if not set
	pCal := "primary"
	if patientCalendarID.Valid && patientCalendarID.String != "" {
		pCal = patientCalendarID.String
	}

	prCal := "primary"
	if providerCalendarID.Valid && providerCalendarID.String != "" {
		prCal = providerCalendarID.String
	}

	return pCal, prCal, nil
}

// updateBookingGCalInfo updates the booking with GCal sync info
func updateBookingGCalInfo(ctx context.Context, bookingID string, result *communication.GCalSyncResult) error {
	query := `
		UPDATE bookings
		SET 
			gcal_provider_event_id = $1,
			gcal_patient_event_id = $2,
			gcal_sync_status = $3,
			gcal_last_sync = NOW(),
			updated_at = NOW()
		WHERE booking_id = $4`

	_, err := db.GetDB().ExecContext(ctx, query,
		result.ProviderEventID,
		result.PatientEventID,
		result.SyncStatus,
		bookingID,
	)

	return err
}

// incrementGCalRetryCount increments the GCal retry count
func incrementGCalRetryCount(ctx context.Context, bookingID string) error {
	query := `
		UPDATE bookings
		SET gcal_retry_count = gcal_retry_count + 1, updated_at = NOW()
		WHERE booking_id = $1`

	_, err := db.GetDB().ExecContext(ctx, query, bookingID)
	return err
}

// Helper function to create string pointer
func ptr(s string) *string {
	return &s
}
