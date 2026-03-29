package inner

import (
	"booking-titanium-wm/internal/infrastructure"
	"booking-titanium-wm/pkg/types"
)

func main(serviceID string, result string, errorMessage string) (map[string]any, error) {
	if serviceID == "" {
		serviceID = "google_calendar"
	}

	var response types.StandardContractResponse[map[string]any]

	if result == "success" {
		response = infrastructure.RecordSuccess(serviceID)
	} else {
		response = infrastructure.RecordFailure(serviceID, errorMessage)
	}

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
