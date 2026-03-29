package inner

import (
	"booking-titanium-wm/internal/orchestrator"
)

// main ejecuta el orquestador de booking (v5.0 - Single Provider)
// NOTE: providerID y serviceID ya no son requeridos - se auto-inyectan desde config
func main(
	providerID int,    // Deprecated: se ignora, usa config
	serviceID int,     // Deprecated: se ignora, usa config
	startTime string,
	chatID string,
	userName string,
	userEmail string,
) (map[string]any, error) {
	req := orchestrator.BookingOrchestratorRequest{
		StartTime:  startTime,
		ChatID:     chatID,
		UserName:   userName,
		UserEmail:  userEmail,
		// ProviderID y ServiceID se auto-inyectan desde system_config
	}

	response := orchestrator.BookingOrchestrator(req)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		return nil, &orchestratorError{message: errorMsg}
	}

	if response.Data == nil {
		return make(map[string]any), nil
	}

	return *response.Data, nil
}

// orchestratorError implementa error para errores del orquestador
type orchestratorError struct {
	message string
}

func (e *orchestratorError) Error() string {
	return e.message
}
