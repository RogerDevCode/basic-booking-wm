package inner

import (
	"booking-titanium-wm/internal/infrastructure"
)

// main adquiere un lock distribuido para sistema single-provider (v5.0)
// NOTE: No requiere provider_id - usa solo start_time
func main(
	startTime string,
	durationMinutes int,
) (map[string]any, error) {
	response := infrastructure.AcquireSingle(
		startTime,
		&durationMinutes,
		nil, // owner_token auto-generated
	)

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
