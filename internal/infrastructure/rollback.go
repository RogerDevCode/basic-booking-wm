package infrastructure

import (
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// RollbackRequest representa una solicitud de rollback
type RollbackRequest struct {
	ProviderID  int     `json:"provider_id"`
	ServiceID   int     `json:"service_id"`
	StartTime   string  `json:"start_time"`
	BookingID   *string `json:"booking_id,omitempty"`
	GCalEventID *string `json:"gcal_event_id,omitempty"`
	LockKey     *string `json:"lock_key,omitempty"`
	OwnerToken  *string `json:"owner_token,omitempty"`
	Reason      string  `json:"reason,omitempty"`
}

// Rollback ejecuta un rollback completo de una operación de booking
func Rollback(req RollbackRequest) types.StandardContractResponse[map[string]any] {
	source := "WF6_Rollback_Workflow"
	workflowID := "rollback-booking-v1"
	version := "1.0.0"

	results := make(map[string]any)
	var errors []string

	// ==========================================================================
	// 1. ROLLBACK GOOGLE CALENDAR EVENT
	// ==========================================================================

	if req.GCalEventID != nil && *req.GCalEventID != "" {
		// TODO: Implement GCal delete
		// For now, just log
		results["gcal"] = map[string]any{
			"attempted": true,
			"success":   false,
			"reason":    "GCal integration not yet implemented",
		}
	} else {
		results["gcal"] = map[string]any{
			"attempted": false,
			"skipped":   true,
			"reason":    "No GCal event ID provided",
		}
	}

	// ==========================================================================
	// 2. ROLLBACK DATABASE BOOKING
	// ==========================================================================

	if req.BookingID != nil && *req.BookingID != "" {
		bookingQueries := db.NewBookingQueries()

		// Check if booking exists
		booking, err := bookingQueries.GetByID(*req.BookingID)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Failed to get booking: %v", err))
			results["db"] = map[string]any{
				"attempted": false,
				"success":   false,
				"error":     err.Error(),
			}
		} else if booking == nil {
			results["db"] = map[string]any{
				"attempted": false,
				"skipped":   true,
				"reason":    "Booking not found",
			}
		} else {
			// Cancel the booking
			reason := req.Reason
			if reason == "" {
				reason = "Automatic rollback due to orchestration failure"
			}

			cancelled, err := bookingQueries.Cancel(*req.BookingID, &reason)
			if err != nil {
				errors = append(errors, fmt.Sprintf("Failed to cancel booking: %v", err))
				results["db"] = map[string]any{
					"attempted": false,
					"success":   false,
					"error":     err.Error(),
				}
			} else if cancelled == nil {
				results["db"] = map[string]any{
					"attempted": true,
					"success":   false,
					"reason":    "Booking already cancelled or not found",
				}
			} else {
				results["db"] = map[string]any{
					"attempted":    true,
					"success":      true,
					"booking_id":   cancelled.ID,
					"new_status":   cancelled.Status,
					"cancelled_at": cancelled.CancelledAt,
				}
			}
		}
	} else {
		results["db"] = map[string]any{
			"attempted": false,
			"skipped":   true,
			"reason":    "No booking ID provided",
		}
	}

	// ==========================================================================
	// 3. RELEASE DISTRIBUTED LOCK
	// ==========================================================================

	if req.LockKey != nil && *req.LockKey != "" && req.OwnerToken != nil && *req.OwnerToken != "" {
		lockQueries := NewDistributedLockQueries()

		response, err := lockQueries.Release(types.ReleaseLockRequest{
			LockKey:    *req.LockKey,
			OwnerToken: *req.OwnerToken,
		})
		if err != nil {
			errors = append(errors, fmt.Sprintf("Failed to release lock: %v", err))
			results["lock"] = map[string]any{
				"attempted": false,
				"success":   false,
				"error":     err.Error(),
			}
		} else {
			results["lock"] = map[string]any{
				"attempted": true,
				"success":   response.Released,
				"message":   response.Message,
			}
		}
	} else {
		results["lock"] = map[string]any{
			"attempted": false,
			"skipped":   true,
			"reason":    "No lock information provided",
		}
	}

	// ==========================================================================
	// 4. RECORD IN DLQ (if there were errors)
	// ==========================================================================

	if len(errors) > 0 {
		// TODO: Add to DLQ
		results["dlq"] = map[string]any{
			"attempted": true,
			"success":   false,
			"reason":    "DLQ integration not yet implemented",
			"errors":    errors,
		}
	}

	// ==========================================================================
	// 5. BUILD RESPONSE
	// ==========================================================================

	hasErrors := len(errors) > 0

	data := map[string]any{
		"rollback_completed": !hasErrors,
		"results":            results,
		"timestamp":          time.Now().UTC().Format(time.RFC3339),
	}

	if hasErrors {
		data["errors"] = errors
		data["partial_success"] = true
	}

	if hasErrors {
		return utils.ErrorResponse[map[string]any](
			"PARTIAL_ROLLBACK_FAILED",
			fmt.Sprintf("Rollback completed with %d errors", len(errors)),
			source,
			workflowID,
			version,
		)
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// RollbackOnBookingError ejecuta un rollback específico para errores de booking
func RollbackOnBookingError(
	bookingID string,
	gcalEventID string,
	lockKey string,
	ownerToken string,
	errorMessage string,
) types.StandardContractResponse[map[string]any] {
	req := RollbackRequest{
		BookingID:   &bookingID,
		GCalEventID: &gcalEventID,
		LockKey:     &lockKey,
		OwnerToken:  &ownerToken,
		Reason:      fmt.Sprintf("Rollback due to: %s", errorMessage),
	}

	return Rollback(req)
}

// RollbackOnAvailabilityError ejecuta un rollback específico para errores de disponibilidad
func RollbackOnAvailabilityError(
	providerID int,
	startTime string,
	lockKey string,
	ownerToken string,
	errorMessage string,
) types.StandardContractResponse[map[string]any] {
	req := RollbackRequest{
		ProviderID: providerID,
		StartTime:  startTime,
		LockKey:    &lockKey,
		OwnerToken: &ownerToken,
		Reason:     fmt.Sprintf("Rollback due to availability error: %s", errorMessage),
	}

	return Rollback(req)
}
