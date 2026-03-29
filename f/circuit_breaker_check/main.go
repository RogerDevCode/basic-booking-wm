package inner

import (
	"booking-titanium-wm/internal/infrastructure"
)

func main(serviceID string) (map[string]any, error) {
	if serviceID == "" {
		serviceID = "google_calendar"
	}

	response := infrastructure.Check(serviceID)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &circuitBreakerError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type circuitBreakerError struct {
	message string
}

func (e *circuitBreakerError) Error() string {
	return e.message
}
