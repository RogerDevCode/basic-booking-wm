package inner

import (
	"booking-titanium-wm/internal/booking"
)

func main(
	bookingID string,
	cancellationReason string,
) (map[string]any, error) {
	response := booking.CancelBooking(bookingID, cancellationReason)

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
