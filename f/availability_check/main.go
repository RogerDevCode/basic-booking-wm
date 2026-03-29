package inner

import (
	"booking-titanium-wm/internal/availability"
)

func main(
	providerID int,
	serviceID int,
	date string,
) (map[string]any, error) {
	response := availability.CheckAvailability(providerID, serviceID, date)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &availabilityError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

// availabilityError implementa error para errores de availability
type availabilityError struct {
	message string
}

func (e *availabilityError) Error() string {
	return e.message
}
