package inner

import (
	"booking-titanium-wm/internal/infrastructure"
)

func main(lockKey string, ownerToken string) (map[string]any, error) {
	response := infrastructure.Release(lockKey, ownerToken)

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
