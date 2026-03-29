package communication

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// GCalConfig holds Google Calendar configuration
type GCalConfig struct {
	CredentialsJSON string
	DefaultCalendar string
}

// resolveGCALCredentials multiplexes between local file (dev), env variable (docker), and Windmill variable (prod)
func resolveGCALCredentials() ([]byte, error) {
	// 1. Try environment variable directly (JSON string)
	envJSON := os.Getenv("GOOGLE_CREDENTIALS_JSON")
	if envJSON != "" {
		return []byte(envJSON), nil
	}

	// 2. Try local development mode path
	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if localPath != "" {
		// Expand ~ to home directory
		if len(localPath) > 0 && localPath[0] == '~' {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("failed to get home directory: %w", err)
			}
			localPath = filepath.Join(homeDir, localPath[1:])
		}

		// Read local file
		data, err := os.ReadFile(localPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read local GCal credentials from %s: %w", localPath, err)
		}

		return data, nil
	}

	// 3. Fallback
	return nil, fmt.Errorf("GOOGLE_CREDENTIALS_JSON or DEV_LOCAL_GCAL_KEY_PATH not set")
}

// GCalClient is a client for Google Calendar operations
type GCalClient struct {
	service *calendar.Service
	config  *GCalConfig
}

// NewGCalClient creates a new Google Calendar client with credentials JSON
func NewGCalClient(credentialsJSON []byte, defaultCalendar string) (*GCalClient, error) {
	ctx := context.Background()

	service, err := calendar.NewService(
		ctx,
		option.WithCredentialsJSON(credentialsJSON),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCal service: %w", err)
	}

	if defaultCalendar == "" {
		defaultCalendar = "primary"
	}

	return &GCalClient{
		service: service,
		config: &GCalConfig{
			CredentialsJSON: string(credentialsJSON),
			DefaultCalendar: defaultCalendar,
		},
	}, nil
}

// CreateEventRequest represents a request to create a GCal event
type CreateEventRequest struct {
	StartTime   string   `json:"start_time"`
	EndTime     string   `json:"end_time,omitempty"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Attendees   []string `json:"attendees,omitempty"`
	CalendarID  string   `json:"calendar_id,omitempty"`
}

// CreateEvent crea un evento en Google Calendar
func CreateEvent(
	startTime string,
	title string,
	description string,
	calendarID string,
) types.StandardContractResponse[map[string]any] {
	source := "GCAL_Create_Event"
	workflowID := "gcal-create-event-v1"
	version := "1.0.0"

	// Validate start_time
	validation := utils.ValidateISODateTime(startTime, "start_time")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Validate title
	if title == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"title is required",
			source,
			workflowID,
			version,
		)
	}

	// Parse start_time
	startTimeObj, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDatetime,
			"Invalid start_time format",
			source,
			workflowID,
			version,
		)
	}

	// Calculate end_time (default 1 hour)
	endTimeObj := startTimeObj.Add(60 * time.Minute)

	// Get calendar ID
	if calendarID == "" {
		calendarID = "primary"
	}

	// Resolve credentials
	credsJSON, err := resolveGCALCredentials()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to load GCal credentials: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Initialize GCal client with resolved credentials
	client, err := NewGCalClient(credsJSON, calendarID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to initialize GCal client: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Create event
	event := &calendar.Event{
		Summary:     title,
		Description: description,
		Start: &calendar.EventDateTime{
			DateTime: startTimeObj.Format(time.RFC3339),
			TimeZone: "America/Mexico_City",
		},
		End: &calendar.EventDateTime{
			DateTime: endTimeObj.Format(time.RFC3339),
			TimeZone: "America/Mexico_City",
		},
	}

	createdEvent, err := client.service.Events.Insert(calendarID, event).Do()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeGCalError,
			fmt.Sprintf("Failed to create GCal event: %v", err),
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"created":     true,
		"event_id":    createdEvent.Id,
		"html_link":   createdEvent.HtmlLink,
		"start_time":  startTime,
		"title":       title,
		"description": description,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// DeleteEvent elimina un evento de Google Calendar
func DeleteEvent(
	eventID string,
	calendarID string,
) types.StandardContractResponse[map[string]any] {
	source := "GCAL_Delete_Event"
	workflowID := "gcal-delete-event-v1"
	version := "1.0.0"

	// Validate event_id
	if eventID == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"event_id is required",
			source,
			workflowID,
			version,
		)
	}

	// Get calendar ID
	if calendarID == "" {
		calendarID = "primary"
	}

	// Resolve credentials
	credsJSON, err := resolveGCALCredentials()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to load GCal credentials: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Initialize GCal client
	client, err := NewGCalClient(credsJSON, calendarID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to initialize GCal client: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Delete event
	err = client.service.Events.Delete(calendarID, eventID).Do()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeGCalError,
			fmt.Sprintf("Failed to delete GCal event: %v", err),
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"deleted":  true,
		"event_id": eventID,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// CheckCollision verifica si hay colisiones con eventos existentes
func CheckCollision(
	startTime string,
	endTime string,
	calendarID string,
) types.StandardContractResponse[map[string]any] {
	source := "WF5_GCal_Collision_Check"
	workflowID := "gcal-collision-check-v1"
	version := "1.0.0"

	// Validate start_time
	validation := utils.ValidateISODateTime(startTime, "start_time")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Parse start_time
	startTimeObj, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDatetime,
			"Invalid start_time format",
			source,
			workflowID,
			version,
		)
	}

	// Calculate end_time if not provided
	var endTimeObj time.Time
	if endTime == "" {
		endTimeObj = startTimeObj.Add(60 * time.Minute)
	} else {
		endTimeObj, err = time.Parse(time.RFC3339, endTime)
		if err != nil {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeInvalidDatetime,
				"Invalid end_time format",
				source,
				workflowID,
				version,
			)
		}
	}

	// Get calendar ID
	if calendarID == "" {
		calendarID = "primary"
	}

	// Resolve credentials
	credsJSON, err := resolveGCALCredentials()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to load GCal credentials: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Initialize client
	client, err := NewGCalClient(credsJSON, calendarID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			fmt.Sprintf("Failed to initialize GCal client: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Query for events
	events, err := client.service.Events.List(calendarID).
		TimeMin(startTimeObj.Format(time.RFC3339)).
		TimeMax(endTimeObj.Format(time.RFC3339)).
		SingleEvents(true).
		OrderBy("startTime").
		Do()

	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeGCalError,
			fmt.Sprintf("Failed to list GCal events: %v", err),
			source,
			workflowID,
			version,
		)
	}

	collisions := []map[string]any{}
	for _, event := range events.Items {
		if event.Status != "cancelled" {
			collisions = append(collisions, map[string]any{
				"event_id": event.Id,
				"summary":  event.Summary,
				"start":    event.Start.DateTime,
			})
		}
	}

	data := map[string]any{
		"has_collision": len(collisions) > 0,
		"collisions":    collisions,
		"start_time":    startTime,
		"end_time":      endTimeObj.Format(time.RFC3339),
		"calendar_id":   calendarID,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
