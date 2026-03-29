package availability

import (
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// CheckAvailability verifica la disponibilidad para una fecha específica
func CheckAvailability(
	providerID string,
	serviceID string,
	date string,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Get_Availability"
	workflowID := "availability-check-v1"
	version := "1.0.0"

	// Validate input
	request := types.CheckAvailabilityRequest{
		ProviderID: providerID,
		ServiceID:  serviceID,
		Date:       date,
	}

	validation := utils.ValidateCheckAvailabilityRequest(request)
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Parse date
	dateObj, err := time.Parse("2006-01-02", date)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDate,
			"Invalid date format",
			source,
			workflowID,
			version,
		)
	}

	// Get service duration (default 60 minutes)
	serviceDuration := 60

	// Get available slots
	availabilityQueries := db.NewAvailabilityQueries()
	slots, err := availabilityQueries.GetAvailableSlots(
		providerID,
		serviceID,
		dateObj,
		serviceDuration,
	)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to get availability",
			source,
			workflowID,
			version,
		)
	}

	// Handle empty result
	if slots == nil {
		slots = []types.Slot{}
	}

	data := map[string]any{
		"provider_id":     providerID,
		"service_id":      serviceID,
		"date":            date,
		"slots":           slots,
		"total_available": len(slots),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// FindNextAvailable encuentra el próximo slot disponible (v5.0 - UUID support)
func FindNextAvailable(
	providerID string,
	serviceID string,
	date string,
) types.StandardContractResponse[map[string]any] {
	source := "DB_Find_Next_Available"
	workflowID := "find-next-available-v1"
	version := "1.0.0"

	// Validate input
	validation := utils.ValidateCheckAvailabilityRequest(types.CheckAvailabilityRequest{
		ProviderID: providerID,
		ServiceID:  serviceID,
		Date:       date,
	})
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Parse start date
	startDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidDate,
			"Invalid date format",
			source,
			workflowID,
			version,
		)
	}

	// Search for next available slot (up to 7 days)
	const maxDaysToSearch = 7
	serviceDuration := 60

	availabilityQueries := db.NewAvailabilityQueries()

	for day := 0; day < maxDaysToSearch; day++ {
		searchDate := startDate.AddDate(0, 0, day)

		slots, err := availabilityQueries.GetAvailableSlots(
			providerID,
			serviceID,
			searchDate,
			serviceDuration,
		)
		if err != nil {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeDBError,
				"Failed to find next available",
				source,
				workflowID,
				version,
			)
		}

		// Return first available slot
		if len(slots) > 0 {
			data := map[string]any{
				"provider_id": providerID,
				"service_id":  serviceID,
				"date":        searchDate.Format("2006-01-02"),
				"slots":       slots,
				"total":       len(slots),
				"message":     "Availability found",
			}

			return utils.SuccessResponse(data, source, workflowID, version)
		}
	}

	// No availability found in search range
	data := map[string]any{
		"provider_id": providerID,
		"service_id":  serviceID,
		"date":        nil,
		"slots":       []types.Slot{},
		"total":       0,
		"message":     "No availability in the next 7 days",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
