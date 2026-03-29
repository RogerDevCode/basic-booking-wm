package inner

import (
	"booking-titanium-wm/internal/booking"
)

func main(bookingID string, newStartTime string) (map[string]any, error) {
	response := booking.RescheduleBooking(bookingID, newStartTime)

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

type bookingError struct {
	message string
}

func (e *bookingError) Error() string {
	return e.message
}
