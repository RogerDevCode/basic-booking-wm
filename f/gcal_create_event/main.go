package inner

import (
	"booking-titanium-wm/internal/communication"
)

func main(startTime string, title string, description string, calendarID string) (map[string]any, error) {
	if calendarID == "" {
		calendarID = "primary"
	}

	response := communication.CreateEvent(startTime, title, description, calendarID)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &gcalError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type gcalError struct {
	message string
}

func (e *gcalError) Error() string {
	return e.message
}
