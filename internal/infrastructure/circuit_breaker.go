package infrastructure

import (
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// CircuitBreakerQueries maneja las queries de circuit breaker
type CircuitBreakerQueries struct{}

// NewCircuitBreakerQueries crea una nueva instancia de CircuitBreakerQueries
func NewCircuitBreakerQueries() *CircuitBreakerQueries {
	return &CircuitBreakerQueries{}
}

// CheckState verifica el estado actual del circuit breaker
func (q *CircuitBreakerQueries) CheckState(serviceID string) (*types.CircuitBreakerState, error) {
	query := `
		SELECT service_id, state, failure_count, success_count, 
		       failure_threshold, success_threshold, timeout_seconds,
		       opened_at, half_open_at, last_failure_at, last_success_at,
		       last_error_message
		FROM circuit_breaker_state 
		WHERE service_id = $1 
		LIMIT 1`

	row := db.GetDB().QueryRow(query, serviceID)

	var state types.CircuitBreakerState
	var openedAt, halfOpenAt, lastFailureAt, lastSuccessAt sql.NullTime
	var lastErrorMessage sql.NullString

	err := row.Scan(
		&state.ServiceID,
		&state.State,
		&state.FailureCount,
		&state.SuccessCount,
		&state.FailureThreshold,
		&state.SuccessThreshold,
		&state.TimeoutSeconds,
		&openedAt,
		&halfOpenAt,
		&lastFailureAt,
		&lastSuccessAt,
		&lastErrorMessage,
	)

	if err == sql.ErrNoRows {
		// Return default closed state
		return &types.CircuitBreakerState{
			ServiceID:        serviceID,
			State:            "closed",
			FailureCount:     0,
			SuccessCount:     0,
			FailureThreshold: 5,
			SuccessThreshold: 3,
			TimeoutSeconds:   300,
		}, nil
	}

	if err != nil {
		return nil, fmt.Errorf("failed to check circuit breaker state: %w", err)
	}

	// Handle null values
	if openedAt.Valid {
		state.OpenedAt = &openedAt.Time
	}
	if halfOpenAt.Valid {
		state.HalfOpenAt = &halfOpenAt.Time
	}
	if lastFailureAt.Valid {
		state.LastFailureAt = &lastFailureAt.Time
	}
	if lastSuccessAt.Valid {
		state.LastSuccessAt = &lastSuccessAt.Time
	}
	if lastErrorMessage.Valid {
		state.LastErrorMessage = &lastErrorMessage.String
	}

	return &state, nil
}

// RecordSuccess registra un éxito en el circuit breaker
func (q *CircuitBreakerQueries) RecordSuccess(serviceID string) error {
	query := `
		INSERT INTO circuit_breaker_state (
			service_id, state, failure_count, success_count, last_success_at, updated_at
		) VALUES (
			$1, 'closed', 0, 1, NOW(), NOW()
		)
		ON CONFLICT (service_id) DO UPDATE SET
			state = CASE 
				WHEN circuit_breaker_state.state = 'half-open' 
				AND circuit_breaker_state.success_count + 1 >= circuit_breaker_state.success_threshold 
				THEN 'closed'
				ELSE circuit_breaker_state.state
			END,
			failure_count = 0,
			success_count = circuit_breaker_state.success_count + 1,
			last_success_at = NOW(),
			updated_at = NOW()
	`

	_, err := db.GetDB().Exec(query, serviceID)
	if err != nil {
		return fmt.Errorf("failed to record circuit breaker success: %w", err)
	}

	return nil
}

// RecordFailure registra un fallo en el circuit breaker
func (q *CircuitBreakerQueries) RecordFailure(serviceID string, errorMessage string) error {
	query := `
		INSERT INTO circuit_breaker_state (
			service_id, state, failure_count, last_failure_at, last_error_message, updated_at
		) VALUES (
			$1, 'open', 1, NOW(), $2, NOW()
		)
		ON CONFLICT (service_id) DO UPDATE SET
			failure_count = circuit_breaker_state.failure_count + 1,
			last_failure_at = NOW(),
			last_error_message = $2,
			state = CASE 
				WHEN circuit_breaker_state.failure_count + 1 >= circuit_breaker_state.failure_threshold 
				THEN 'open'
				ELSE circuit_breaker_state.state
			END,
			opened_at = CASE 
				WHEN circuit_breaker_state.failure_count + 1 >= circuit_breaker_state.failure_threshold 
				THEN NOW()
				ELSE circuit_breaker_state.opened_at
			END,
			updated_at = NOW()
	`

	_, err := db.GetDB().Exec(query, serviceID, errorMessage)
	if err != nil {
		return fmt.Errorf("failed to record circuit breaker failure: %w", err)
	}

	return nil
}

// Check verifica el estado del circuit breaker y retorna si está permitido
func Check(serviceID string) types.StandardContractResponse[map[string]any] {
	source := "CB_01_Check_State"
	workflowID := "circuit-breaker-check-v1"
	version := "1.0.0"

	// Validate service_id
	if serviceID == "" {
		serviceID = "google_calendar" // Default
	}

	if len(serviceID) > 100 {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidInput,
			"service_id too long (max 100 chars)",
			source,
			workflowID,
			version,
		)
	}

	// Simple regex-like validation for service_id (no spaces, Alphanumeric and _ -)
	for _, r := range serviceID {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeInvalidInput,
				"service_id contains invalid characters",
				source,
				workflowID,
				version,
			)
		}
	}

	// Get current state
	queries := NewCircuitBreakerQueries()
	state, err := queries.CheckState(serviceID)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to check circuit breaker state",
			source,
			workflowID,
			version,
		)
	}

	// Determine if requests are allowed
	var allowed bool
	var circuitState string
	var message string
	var retryAfterSeconds *int

	switch state.State {
	case "closed":
		allowed = true
		circuitState = "closed"
		message = "Service is healthy - requests allowed"

	case "half-open":
		// Check if timeout has passed
		if state.OpenedAt != nil {
			elapsed := time.Since(*state.OpenedAt).Seconds()
			if elapsed >= float64(state.TimeoutSeconds) {
				// Transition to half-open
				allowed = true
				circuitState = "half-open"
				message = "Circuit in half-open state - test request allowed"
			} else {
				allowed = false
				circuitState = "half-open"
				retryAfter := int(float64(state.TimeoutSeconds) - elapsed)
				retryAfterSeconds = &retryAfter
				message = fmt.Sprintf("Circuit in half-open state - retry in %d seconds", retryAfter)
			}
		} else {
			allowed = true
			circuitState = "half-open"
			message = "Circuit in half-open state - test request allowed"
		}

	case "open":
		// Check if timeout has passed
		if state.OpenedAt != nil {
			elapsed := time.Since(*state.OpenedAt).Seconds()
			if elapsed >= float64(state.TimeoutSeconds) {
				// Transition to half-open
				allowed = true
				circuitState = "half-open"
				message = "Circuit transitioned to half-open - test request allowed"

				// Update state to half-open
				_ = queries.RecordSuccess(serviceID) // This will transition to half-open
			} else {
				allowed = false
				circuitState = "open"
				retryAfter := int(float64(state.TimeoutSeconds) - elapsed)
				retryAfterSeconds = &retryAfter
				message = fmt.Sprintf("Circuit breaker OPEN - service unavailable. Retry in %d seconds", retryAfter)
			}
		} else {
			allowed = false
			circuitState = "open"
			message = "Circuit breaker OPEN - service unavailable"
		}
	}

	data := map[string]any{
		"allowed":       allowed,
		"circuit_state": circuitState,
		"message":       message,
		"failure_count": state.FailureCount,
		"service_id":    serviceID,
	}

	if retryAfterSeconds != nil {
		data["retry_after_seconds"] = *retryAfterSeconds
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// RecordSuccess registra un éxito
func RecordSuccess(serviceID string) types.StandardContractResponse[map[string]any] {
	source := "CB_02_Record_Result"
	workflowID := "circuit-breaker-record-v1"
	version := "1.0.0"

	if serviceID == "" {
		serviceID = "google_calendar"
	}

	if len(serviceID) > 100 {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidInput,
			"service_id too long (max 100 chars)",
			source,
			workflowID,
			version,
		)
	}

	for _, r := range serviceID {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeInvalidInput,
				"service_id contains invalid characters",
				source,
				workflowID,
				version,
			)
		}
	}

	queries := NewCircuitBreakerQueries()
	err := queries.RecordSuccess(serviceID)
	if err != nil {
		fmt.Printf("[CB] RecordSuccess failed for %s: %v\n", serviceID, err)
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to record circuit breaker success",
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"recorded":   true,
		"service_id": serviceID,
		"result":     "success",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// RecordFailure registra un fallo
func RecordFailure(serviceID string, errorMessage string) types.StandardContractResponse[map[string]any] {
	source := "CB_02_Record_Result"
	workflowID := "circuit-breaker-record-v1"
	version := "1.0.0"

	if serviceID == "" {
		serviceID = "google_calendar"
	}

	if len(serviceID) > 100 {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInvalidInput,
			"service_id too long (max 100 chars)",
			source,
			workflowID,
			version,
		)
	}

	for _, r := range serviceID {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return utils.ErrorResponse[map[string]any](
				types.ErrorCodeInvalidInput,
				"service_id contains invalid characters",
				source,
				workflowID,
				version,
			)
		}
	}

	queries := NewCircuitBreakerQueries()
	err := queries.RecordFailure(serviceID, errorMessage)
	if err != nil {
		fmt.Printf("[CB] RecordFailure failed for %s: %v\n", serviceID, err)
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to record circuit breaker failure",
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"recorded":   true,
		"service_id": serviceID,
		"result":     "failure",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
