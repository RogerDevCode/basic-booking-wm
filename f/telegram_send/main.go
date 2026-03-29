package inner

import (
	"booking-titanium-wm/internal/communication"
)

func main(chatID string, text string, parseMode string) (map[string]any, error) {
	response := communication.SendMessage(chatID, text, parseMode)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &telegramError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

type telegramError struct {
	message string
}

func (e *telegramError) Error() string {
	return e.message
}
