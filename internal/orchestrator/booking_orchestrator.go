package orchestrator

import (
	"fmt"
	"time"

	"booking-titanium-wm/internal/availability"
	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/communication"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/infrastructure"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// BookingOrchestratorRequest representa una solicitud al orquestador (v5.0 - Single Provider)
// NOTE: ProviderID and ServiceID are NO LONGER required - they are auto-injected from config
type BookingOrchestratorRequest struct {
	StartTime string `json:"start_time"`
	ChatID    string `json:"chat_id"`
	UserName  string `json:"user_name,omitempty"`
	UserEmail string `json:"user_email,omitempty"`
}

// BookingOrchestrator ejecuta el flujo completo de creación de reservas (v5.0 - Single Provider)
func BookingOrchestrator(req BookingOrchestratorRequest) types.StandardContractResponse[map[string]any] {
	source := "WF2_Booking_Orchestrator"
	workflowID := "booking-orchestrator-v1"
	version := "1.0.0"

	// Get system configuration (auto-inject provider and service)
	cfg := config.GetSystemConfig()
	
	// v5.0 - Use UUIDs directly from system configuration
	providerID := cfg.ProviderID
	serviceID := cfg.ServiceID

	// ==========================================================================
	// 1. GENERAR IDEMPOTENCY KEY (simplified for single-provider)
	// ==========================================================================

	idempotencyKey := utils.GenerateIdempotencyKeySingleUUID(
		serviceID,
		req.StartTime,
		req.ChatID,
	)

	_ = idempotencyKey // Used internally by booking.CreateBooking
	_ = cfg            // Used for configuration

	// ==========================================================================
	// 2. CHECK CIRCUIT BREAKER (Google Calendar)
	// ==========================================================================

	cbResponse := infrastructure.Check("google_calendar")
	if !cbResponse.Success {
		return cbResponse
	}

	cbAllowed := false
	if cbResponse.Data != nil {
		if allowed, ok := (*cbResponse.Data)["allowed"].(bool); ok {
			cbAllowed = allowed
		}
	}

	if !cbAllowed {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeCircuitBreakerOpen,
			"Google Calendar service is temporarily unavailable",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 3. ACQUIRE DISTRIBUTED LOCK (simplified key for single-provider)
	// ==========================================================================

	lockDuration := 5 // minutes
	lockResponse := infrastructure.AcquireSingle(
		req.StartTime,
		&lockDuration,
		nil, // owner_token auto-generated
	)

	if !lockResponse.Success {
		return lockResponse
	}

	lockAcquired := false
	if lockResponse.Data != nil {
		if acquired, ok := (*lockResponse.Data)["acquired"].(bool); ok {
			lockAcquired = acquired
		}
	}

	if !lockAcquired {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeLockHeld,
			"Another process is handling this time slot",
			source,
			workflowID,
			version,
		)
	}

	var lockKey, ownerToken string
	if lockResponse.Data != nil {
		if lk, ok := (*lockResponse.Data)["lock_key"].(string); ok {
			lockKey = lk
		}
		if ot, ok := (*lockResponse.Data)["owner_token"].(string); ok {
			ownerToken = ot
		}
	}

	// Function to release lock on exit
	defer func() {
		if lockKey != "" && ownerToken != "" {
			infrastructure.Release(lockKey, ownerToken)
		}
	}()

	// ==========================================================================
	// 4. CHECK AVAILABILITY (auto-inject provider/service from config)
	// ==========================================================================

	// Extract date from start_time
	var date string
	if len(req.StartTime) >= 10 {
		date = req.StartTime[:10] // YYYY-MM-DD
	}

	availResponse := availability.CheckAvailability(
		providerID,
		serviceID,
		date,
	)

	if !availResponse.Success {
		return availResponse
	}

	// Check if specific slot is available
	slotFound := false
	if availResponse.Data != nil {
		if slots, ok := (*availResponse.Data)["slots"].([]types.Slot); ok {
			for _, slot := range slots {
				if slot.StartTime.Format(time.RFC3339) == req.StartTime && slot.Available {
					slotFound = true
					break
				}
			}
		}
	}

	if !slotFound {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeNoAvailability,
			"Requested time slot is not available",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 5. CREATE GOOGLE CALENDAR EVENT (auto-inject provider/service)
	// ==========================================================================

	gcalResponse := communication.CreateEvent(
		req.StartTime,
		fmt.Sprintf("Reserva: %s", req.UserName),
		fmt.Sprintf("Service ID: %s", serviceID),
		"primary",
	)

	var gcalEventID string
	if gcalResponse.Success {
		if gcalResponse.Data != nil {
			if eventID, ok := (*gcalResponse.Data)["event_id"].(string); ok && eventID != "" {
				gcalEventID = eventID
			}
		}

		// Record circuit breaker success
		infrastructure.RecordSuccess("google_calendar")
	} else {
		// Record circuit breaker failure
		errMsg := "Unknown GCal error"
		if gcalResponse.ErrorMessage != nil {
			errMsg = *gcalResponse.ErrorMessage
		}
		infrastructure.RecordFailure("google_calendar", errMsg)

		return gcalResponse
	}

	// ==========================================================================
	// 6. CREATE BOOKING IN DATABASE (auto-inject provider/service)
	// ==========================================================================

	bookingResponse := booking.CreateBooking(
		providerID,
		serviceID,
		req.StartTime,
		req.ChatID,
		req.UserName,
		req.UserEmail,
		gcalEventID,
	)

	if !bookingResponse.Success {
		// Rollback: Delete GCal event
		if gcalEventID != "" {
			communication.DeleteEvent(gcalEventID, "primary")
		}

		return bookingResponse
	}

	// ==========================================================================
	// 7. RELEASE LOCK (success path)
	// ==========================================================================

	infrastructure.Release(lockKey, ownerToken)
	lockKey = ""
	ownerToken = ""

	// ==========================================================================
	// 8. RETURN SUCCESS
	// ==========================================================================

	return bookingResponse
}

// BookingOrchestratorWithRollback ejecuta el orquestador con rollback automático
func BookingOrchestratorWithRollback(req BookingOrchestratorRequest) types.StandardContractResponse[map[string]any] {
	response := BookingOrchestrator(req)

	if !response.Success {
		// Automatic rollback on failure
		// TODO: Implement full rollback with DLQ recording
	}

	return response
}
