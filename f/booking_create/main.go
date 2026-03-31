package inner

import (
	"booking-titanium-wm/internal/booking"
)

func main(
	providerID string,
	serviceID string,
	startTime string,
	chatID string,
	userName string,
	userEmail string,
	gcalEventID string,
) (map[string]any, error) {
	response := booking.CreateBooking(
		providerID,
		serviceID,
		startTime,
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &bookingError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

// bookingError implementa error para errores de booking
type bookingError struct {
	message string
}

func (e *bookingError) Error() string {
	return e.message
}
