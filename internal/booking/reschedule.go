package booking

import (
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// RescheduleBooking reagenda una reserva existente
// Windmill Script: booking/reschedule
func RescheduleBooking(
	bookingID string,
	newStartTime string,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Reschedule_Booking"
	workflowID := "booking-reschedule-v1"
	version := "1.0.0"

	// ==========================================================================
	// 1. VALIDAR INPUT
	// ==========================================================================

	request := types.RescheduleBookingRequest{
		BookingID:    bookingID,
		NewStartTime: newStartTime,
	}

	validation := utils.ValidateRescheduleBookingRequest(request)

	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 2. CHECK QUE EXISTE EL BOOKING
	// ==========================================================================

	bookingQueries := db.NewBookingQueries()
	existing, err := bookingQueries.GetByID(bookingID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to get booking",
			source,
			workflowID,
			version,
		)
	}

	if existing == nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeBookingNotFound,
			"Booking not found",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 3. CHECK QUE NO ESTÉ CANCELADA
	// ==========================================================================

	if existing.Status == types.StatusCancelled {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeBookingAlreadyCancelled,
			"Cannot reschedule a cancelled booking",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 4. CHECK DISPONIBILIDAD DEL NUEVO SLOT
	// ==========================================================================

	// Parse new_start_time
	newStartDateTime, err := time.Parse(time.RFC3339, newStartTime)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDatetime,
			"Invalid new_start_time format",
			source,
			workflowID,
			version,
		)
	}

	// Calcular duración original y nuevo end_time
	originalDuration := existing.EndTime.Sub(existing.StartTime)
	newEndDateTime := newStartDateTime.Add(originalDuration)

	availabilityQueries := db.NewAvailabilityQueries()
	isAvailable, err := availabilityQueries.CheckSlotAvailability(
		existing.ProviderID,
		existing.ServiceID,
		newStartDateTime,
		newEndDateTime,
	)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to check availability",
			source,
			workflowID,
			version,
		)
	}

	if !isAvailable {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeSlotUnavailable,
			"Requested new time slot is not available",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 5. RESCHEDULE BOOKING
	// ==========================================================================

	rescheduled, err := bookingQueries.Reschedule(bookingID, newStartDateTime, newEndDateTime)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to reschedule booking in database",
			source,
			workflowID,
			version,
		)
	}

	if rescheduled == nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to reschedule booking - no data returned",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 6. RETURN SUCCESS
	// ==========================================================================

	data := map[string]any{
		"booking_id":     rescheduled.ID,
		"status":         rescheduled.Status,
		"rescheduled":    true,
		"new_start_time": rescheduled.StartTime.Format(time.RFC3339),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
