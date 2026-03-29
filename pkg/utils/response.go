package utils

import (
	"time"

	"booking-titanium-wm/pkg/types"
)

// SuccessResponse crea una respuesta estándar para éxito
func SuccessResponse[T any](data T, source string, workflowID string, version string) types.StandardContractResponse[T] {
	return types.StandardContractResponse[T]{
		Success:      true,
		ErrorCode:    nil,
		ErrorMessage: nil,
		Data:         &data,
		Meta: types.ResponseMetadata{
			Source:     source,
			Timestamp:  time.Now().UTC().Format(time.RFC3339),
			WorkflowID: workflowID,
			Version:    version,
		},
	}
}

// ErrorResponse crea una respuesta estándar para error
func ErrorResponse[T any](errorCode string, errorMessage string, source string, workflowID string, version string) types.StandardContractResponse[T] {
	var emptyData T
	return types.StandardContractResponse[T]{
		Success:      false,
		ErrorCode:    &errorCode,
		ErrorMessage: &errorMessage,
		Data:         &emptyData,
		Meta: types.ResponseMetadata{
			Source:     source,
			Timestamp:  time.Now().UTC().Format(time.RFC3339),
			WorkflowID: workflowID,
			Version:    version,
		},
	}
}

// MergeResponses combina múltiples respuestas en una sola
func MergeResponses(responses []types.StandardContractResponse[map[string]any], source string, workflowID string) types.StandardContractResponse[map[string]any] {
	// Buscar si hay algún error
	for _, resp := range responses {
		if !resp.Success {
			return resp
		}
	}

	// Todos exitosos - combinar datos
	combinedData := make(map[string]any)

	for _, resp := range responses {
		if resp.Data != nil {
			for k, v := range *resp.Data {
				combinedData[k] = v
			}
		}
	}

	return SuccessResponse(combinedData, source, workflowID, "1.0.0")
}

// IsValidResponse valida que una respuesta tenga el formato correcto
func IsValidResponse(response any) bool {
	resp, ok := response.(types.StandardContractResponse[map[string]any])
	if !ok {
		return false
	}

	if resp.Meta.Source == "" {
		return false
	}

	if resp.Meta.Timestamp == "" {
		return false
	}

	return true
}

// JSErrorToResponse convierte un error de Go a Standard Contract
func JSErrorToResponse(err error, source string, workflowID string) types.StandardContractResponse[map[string]any] {
	errorCode := types.ErrorCodeInternalError
	errorMessage := err.Error()

	// Clasificar el error
	if err.Error() == "connection refused" {
		errorCode = types.ErrorCodeDBConnectionError
	} else if err.Error() == "context deadline exceeded" {
		errorCode = types.ErrorCodeDBTimeout
	}

	return ErrorResponse[map[string]any](errorCode, errorMessage, source, workflowID, "1.0.0")
}
