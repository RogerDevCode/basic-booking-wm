package inner

import (
	"booking-titanium-wm/internal/providers"
)

func main() (map[string]any, error) {
	response := providers.GetProviders()

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &providersError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type providersError struct {
	message string
}

func (e *providersError) Error() string {
	return e.message
}
