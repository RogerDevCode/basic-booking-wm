package communication

import (
	"fmt"
	"math"
	"strings"
	"time"

	"booking-titanium-wm/pkg/logging"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"
)

var syncLog = logging.GetDefaultLogger()

// ============================================================================
// CONSTANTS
// ============================================================================

const (
	SyncMaxRetries         = 3
	SyncBaseBackoffSeconds = 1  // Backoff: 1s, 3s, 9s (3^attempt)
	SyncGCalTimeoutSeconds = 30 // Timeout for GCal API calls
)

// GCalSyncResult represents the result of a GCal sync operation (v4.0 compliant)
type GCalSyncResult struct {
	ProviderEventID string `json:"provider_event_id"`
	PatientEventID  string `json:"patient_event_id"`
	SyncStatus      string `json:"sync_status"` // "synced", "partial", "pending"
	RetryCount      int    `json:"retry_count"`
	Error           string `json:"error,omitempty"`
}

// ============================================================================
// BIDIRECTIONAL SYNC (PROVIDER + PATIENT) - v4.0 LAW-13
// ============================================================================

// SyncBookingToGCal syncs a booking to both provider and patient calendars (v4.0 LAW-13)
// This is the main entry point for GCal sync in the booking flow
func SyncBookingToGCal(
	credentialsJSON string,
	providerCalendarID string,
	patientCalendarID string,
	eventTitle string,
	eventDescription string,
	startTime string,
	endTime string,
	timezone string,
) (*GCalSyncResult, error) {

	if startTime == "" {
		return nil, fmt.Errorf("validation: start_time is required")
	}

	result := &GCalSyncResult{
		SyncStatus: "pending",
		RetryCount: 0,
	}

	// Parse times
	startTimeObj, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return nil, fmt.Errorf("validation: invalid start_time format: %w", err)
	}

	var endTimeObj time.Time
	if endTime == "" {
		endTimeObj = startTimeObj.Add(60 * time.Minute)
	} else {
		endTimeObj, err = time.Parse(time.RFC3339, endTime)
		if err != nil {
			return nil, fmt.Errorf("validation: invalid end_time format: %w", err)
		}
	}

	if timezone == "" {
		timezone = "America/Mexico_City"
	}

	// Sync to provider calendar with retry
	providerEventID, err := createEventWithRetry(
		credentialsJSON,
		providerCalendarID,
		eventTitle,
		eventDescription,
		startTimeObj,
		endTimeObj,
	)
	if err != nil {
		result.Error = fmt.Sprintf("provider_sync_failed: %s", err.Error())
		syncLog.Error("GCal sync failed for provider calendar: %v", err)
	} else {
		result.ProviderEventID = providerEventID
		syncLog.Info("GCal event created for provider calendar_id=%s event_id=%s",
			providerCalendarID, providerEventID)
	}

	// Sync to patient calendar with retry
	patientEventID, err2 := createEventWithRetry(
		credentialsJSON,
		patientCalendarID,
		eventTitle,
		eventDescription,
		startTimeObj,
		endTimeObj,
	)
	if err2 != nil {
		if result.Error != "" {
			result.Error += "; "
		}
		result.Error += fmt.Sprintf("patient_sync_failed: %s", err2.Error())
		syncLog.Error("GCal sync failed for patient calendar: %v", err2)
	} else {
		result.PatientEventID = patientEventID
		syncLog.Info("GCal event created for patient calendar_id=%s event_id=%s",
			patientCalendarID, patientEventID)
	}

	// Determine sync status (v4.0 SYNC-04, SYNC-06)
	switch {
	case err == nil && err2 == nil:
		result.SyncStatus = "synced"
	case err == nil || err2 == nil:
		result.SyncStatus = "partial"
	default:
		result.SyncStatus = "pending"
	}

	return result, nil
}

// createEventWithRetry creates a GCal event with exponential backoff retry (v4.0 LAW-15)
func createEventWithRetry(
	credentialsJSON string,
	calendarID string,
	title string,
	description string,
	startTime time.Time,
	endTime time.Time,
) (string, error) {

	operation := func() (string, error) {
		client, err := NewGCalClient([]byte(credentialsJSON), calendarID)
		if err != nil {
			return "", err
		}

		event := &calendar.Event{
			Summary:     title,
			Description: description,
			Start: &calendar.EventDateTime{
				DateTime: startTime.Format(time.RFC3339),
				TimeZone: timezoneOrDefault("America/Mexico_City"),
			},
			End: &calendar.EventDateTime{
				DateTime: endTime.Format(time.RFC3339),
				TimeZone: timezoneOrDefault("America/Mexico_City"),
			},
		}

		createdEvent, err := client.service.Events.Insert(calendarID, event).Do()
		if err != nil {
			return "", fmt.Errorf("GCal insert failed: %w", err)
		}

		return createdEvent.Id, nil
	}

	return withRetry(operation, "gcal_create_event")
}

// ============================================================================
// RETRY PROTOCOL - v4.0 LAW-15
// ============================================================================

// withRetry executes fn up to SyncMaxRetries times with exponential backoff.
// Retries only on transient errors (5xx, timeout, network, 429).
// Fails immediately on permanent errors (4xx except 429).
func withRetry(fn func() (string, error), operation string) (string, error) {
	var lastErr error
	var lastResult string

	for attempt := 0; attempt < SyncMaxRetries; attempt++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}

		if isPermanentError(err) {
			syncLog.Error("%s: permanent error on attempt %d: %v", operation, attempt+1, err)
			return "", fmt.Errorf("%s: permanent error: %w", operation, err)
		}

		lastErr = err
		lastResult = result

		if attempt < SyncMaxRetries-1 {
			backoff := time.Duration(math.Pow(3, float64(attempt))) * time.Second
			syncLog.Warn("%s: transient error on attempt %d, retrying in %v: %v",
				operation, attempt+1, backoff, err)
			time.Sleep(backoff) // 1s, 3s, 9s
		}
	}

	syncLog.Error("%s: failed after %d retries", operation, SyncMaxRetries)
	return lastResult, fmt.Errorf("%s: failed after %d retries: %w", operation, SyncMaxRetries, lastErr)
}

// isPermanentError determines if an error is permanent (4xx) or transient (5xx, timeout, network).
// Permanent errors should NOT be retried.
func isPermanentError(err error) bool {
	// Check if it's a googleapi.Error
	if gErr, ok := err.(*googleapi.Error); ok {
		// 4xx errors (except 429 Rate Limit) are permanent
		if gErr.Code >= 400 && gErr.Code < 500 && gErr.Code != 429 {
			return true
		}
		// 429 Rate Limit is transient (should retry)
		if gErr.Code == 429 {
			return false
		}
		// 5xx errors are transient (should retry)
		if gErr.Code >= 500 {
			return false
		}
	}

	// Check for timeout errors
	if strings.Contains(err.Error(), "timeout") ||
		strings.Contains(err.Error(), "deadline exceeded") ||
		strings.Contains(err.Error(), "context canceled") {
		return false // Transient
	}

	// Check for network errors
	if strings.Contains(err.Error(), "connection refused") ||
		strings.Contains(err.Error(), "no such host") ||
		strings.Contains(err.Error(), "network is unreachable") {
		return false // Transient
	}

	// Default: assume transient (retry)
	return false
}

// ============================================================================
// RECONCILIATION CRON JOB - v4.0 SYNC-05
// ============================================================================

// ReconcileGCalSyncResult represents the result of a reconciliation run
type ReconcileGCalSyncResult struct {
	Processed  int `json:"processed"`
	Succeeded  int `json:"succeeded"`
	Failed     int `json:"failed"`
	Remaining  int `json:"remaining"`
}

// ReconcileGCalSync is a cron job that reconciles pending GCal syncs
// Schedule this to run every 5 minutes: */5 * * * *
func ReconcileGCalSync(
	dbQueryFunc func() ([]map[string]any, error),
	syncFunc func(map[string]any) error,
) (*ReconcileGCalSyncResult, error) {

	result := &ReconcileGCalSyncResult{}

	// Query bookings with pending/partial sync
	bookings, err := dbQueryFunc()
	if err != nil {
		return nil, fmt.Errorf("failed to query pending syncs: %w", err)
	}

	result.Remaining = len(bookings)

	for _, booking := range bookings {
		result.Processed++

		err := syncFunc(booking)
		if err != nil {
			result.Failed++
			syncLog.Error("GCal reconciliation failed for booking_id=%v: %v",
				booking["booking_id"], err)
		} else {
			result.Succeeded++
			syncLog.Info("GCal reconciliation succeeded for booking_id=%v",
				booking["booking_id"])
		}
	}

	syncLog.Info("GCal reconciliation completed: processed=%d, succeeded=%d, failed=%d",
		result.Processed, result.Succeeded, result.Failed)

	return result, nil
}

// ============================================================================
// HELPERS
// ============================================================================

func timezoneOrDefault(tz string) string {
	if tz == "" {
		return "America/Mexico_City"
	}
	return tz
}
