package inner

import (
	"booking-titanium-wm/internal/providers"
)

func main(providerID int) (map[string]any, error) {
	response := providers.GetServicesByProvider(providerID)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &servicesError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type servicesError struct {
	message string
}

func (e *servicesError) Error() string {
	return e.message
}
