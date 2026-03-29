package inner

import (
	"booking-titanium-wm/internal/infrastructure"
)

func main(
	providerID int,
	startTime string,
	lockDurationMinutes int,
) (map[string]any, error) {
	var durationPtr *int
	if lockDurationMinutes > 0 {
		durationPtr = &lockDurationMinutes
	}

	response := infrastructure.Acquire(providerID, startTime, durationPtr, nil)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &lockError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type lockError struct {
	message string
}

func (e *lockError) Error() string {
	return e.message
}
