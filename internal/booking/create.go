package booking

import (
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// CreateBooking crea una nueva reserva (v5.0 - UUID support)
func CreateBooking(
	providerID string,
	serviceID string,
	startTime string,
	chatID string,
	userName string,
	userEmail string,
	gcalEventID string,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Create_Booking"
	workflowID := "booking-create-v1"
	version := "1.0.0"

	// ==========================================================================
	// 1. VALIDAR INPUT
	// ==========================================================================

	request := types.CreateBookingRequest{
		ProviderID: providerID,
		ServiceID:  serviceID,
		StartTime:  startTime,
		ChatID:     chatID,
		UserName:   userName,
		UserEmail:  userEmail,
	}

	validation := utils.ValidateCreateBookingRequest(request)

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
	// 2. GENERAR IDEMPOTENCY KEY (Single Provider UUID version)
	// ==========================================================================

	idempotencyKey := utils.GenerateIdempotencyKeySingleUUID(serviceID, startTime, chatID)

	// ==========================================================================
	// 3. CHECK IDEMPOTENCY
	// ==========================================================================

	bookingQueries := db.NewBookingQueries()
	existing, err := bookingQueries.CheckIdempotency(idempotencyKey)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to check idempotency",
			source,
			workflowID,
			version,
		)
	}

	if existing != nil {
		data := map[string]any{
			"id":           existing.ID,
			"status":       existing.Status,
			"is_duplicate": true,
		}
		return utils.SuccessResponse(data, source, workflowID, version)
	}

	// ==========================================================================
	// 4. CHECK DISPONIBILIDAD
	// ==========================================================================

	// Parse start_time
	startDateTime, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDatetime,
			"Invalid start_time format",
			source,
			workflowID,
			version,
		)
	}

	// Calcular end_time (60 minutos por defecto)
	endDateTime := startDateTime.Add(60 * time.Minute)

	availabilityQueries := db.NewAvailabilityQueries()
	isAvailable, err := availabilityQueries.CheckSlotAvailability(
		providerID,
		serviceID,
		startDateTime,
		endDateTime,
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
			"Requested time slot is not available",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 5. CREAR BOOKING
	// ==========================================================================

	var gcalEventIDPtr *string
	if gcalEventID != "" {
		gcalEventIDPtr = &gcalEventID
	}

	createData := db.CreateBookingData{
		ProviderID:     providerID,
		ServiceID:      serviceID,
		StartTime:      startDateTime,
		EndTime:        endDateTime,
		IdempotencyKey: idempotencyKey,
		ChatID:         chatID,
		GCalEventID:    gcalEventIDPtr,
		Status:         types.StatusConfirmed,
	}

	booking, err := bookingQueries.Create(createData)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to create booking in database: "+err.Error(),
			source,
			workflowID,
			version,
		)
	}

	if booking == nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to create booking - no data returned",
			source,
			workflowID,
			version,
		)
	}

	// ==========================================================================
	// 6. RETURN SUCCESS
	// ==========================================================================

	data := map[string]any{
		"id":           booking.ID,
		"status":       booking.Status,
		"provider_id":  providerID,
		"service_id":   serviceID,
		"start_time":   startTime,
		"end_time":     endDateTime.Format(time.RFC3339),
		"is_duplicate": false,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
