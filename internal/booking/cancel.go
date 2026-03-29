package booking

import (
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// CancelBooking cancela una reserva existente
// Windmill Script: booking/cancel
func CancelBooking(
	bookingID string,
	cancellationReason string,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Cancel_Booking"
	workflowID := "booking-cancel-v1"
	version := "1.0.0"

	// ==========================================================================
	// 1. VALIDAR INPUT
	// ==========================================================================

	var reasonPtr *string
	if cancellationReason != "" {
		reasonPtr = &cancellationReason
	}

	request := types.CancelBookingRequest{
		BookingID:          bookingID,
		CancellationReason: reasonPtr,
	}

	validation := utils.ValidateCancelBookingRequest(request)

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
	// 3. CHECK QUE NO ESTÉ YA CANCELADA
	// ==========================================================================

	if existing.Status == types.StatusCancelled {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeBookingAlreadyCancelled,
			"Booking is already cancelled",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 4. CANCELAR BOOKING
	// ==========================================================================

	cancelled, err := bookingQueries.Cancel(bookingID, reasonPtr)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to cancel booking in database",
			source,
			workflowID,
			version,
		)
	}

	if cancelled == nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to cancel booking - no data returned",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 5. RETURN SUCCESS
	// ==========================================================================

	data := map[string]any{
		"booking_id": cancelled.ID,
		"status":     cancelled.Status,
		"cancelled":  true,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
