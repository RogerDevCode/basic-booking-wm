package booking

import (
	"fmt"

	"github.com/lib/pq"
)

// BookingError represents a booking-specific error with user-safe messages
type BookingError struct {
	Code       string // Internal error code
	Message    string // Detailed technical message
	UserSafe   string // Safe to show to end users
	Retryable  bool   // Whether the operation can be retried
	HTTPStatus int    // HTTP status code for API responses
}

// Error implements the error interface
func (e *BookingError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Error codes
const (
	// Validation errors
	ErrValidationFailed     = "VALIDATION_FAILED"
	ErrInvalidUUID          = "INVALID_UUID"
	ErrInvalidDatetime      = "INVALID_DATETIME"
	ErrInvalidTimezone      = "INVALID_TIMEZONE"
	ErrMissingField         = "MISSING_FIELD"
	ErrInvalidLength        = "INVALID_LENGTH"

	// Booking errors
	ErrBookingNotFound         = "BOOKING_NOT_FOUND"
	ErrBookingAlreadyExists    = "BOOKING_ALREADY_EXISTS"
	ErrBookingConflict         = "BOOKING_CONFLICT"
	ErrBookingUnavailable      = "BOOKING_UNAVAILABLE"
	ErrBookingAlreadyCancelled = "BOOKING_ALREADY_CANCELLED"
	ErrBookingAlreadyConfirmed = "BOOKING_ALREADY_CONFIRMED"
	ErrInvalidStatusTransition = "INVALID_STATUS_TRANSITION"

	// Lock errors
	ErrLockAcquisitionFailed = "LOCK_ACQUISITION_FAILED"
	ErrLockTimeout           = "LOCK_TIMEOUT"
	ErrDeadlockDetected      = "DEADLOCK_DETECTED"

	// Database errors
	ErrDatabaseError        = "DATABASE_ERROR"
	ErrSerializationFailure = "SERIALIZATION_FAILURE"
	ErrExclusionViolation   = "EXCLUSION_VIOLATION"
	ErrUniqueViolation      = "UNIQUE_VIOLATION"
	ErrForeignKeyViolation  = "FOREIGN_KEY_VIOLATION"

	// GCal errors
	ErrGCalSyncFailed = "GCAL_SYNC_FAILED"

	// System errors
	ErrInternalError = "INTERNAL_ERROR"
)

// MapPostgreSQLError maps PostgreSQL errors to booking errors
func MapPostgreSQLError(err error) error {
	if err == nil {
		return nil
	}

	// Check if it's a PostgreSQL error
	if pqErr, ok := err.(*pq.Error); ok {
		return mapPostgresError(pqErr)
	}

	// Check for exclusion constraint in error message
	errStr := err.Error()
	if containsString(errStr, "booking_no_overlap") {
		return &BookingError{
			Code:       ErrExclusionViolation,
			Message:    "Exclusion constraint violated: overlapping booking",
			UserSafe:   "This time slot is no longer available. Please select another time.",
			Retryable:  true,
			HTTPStatus: 409,
		}
	}

	// Unknown error - wrap as internal error
	return &BookingError{
		Code:       ErrInternalError,
		Message:    err.Error(),
		UserSafe:   "An unexpected error occurred. Please try again later.",
		Retryable:  false,
		HTTPStatus: 500,
	}
}

// mapPostgresError maps specific PostgreSQL error codes
func mapPostgresError(pqErr *pq.Error) error {
	switch pqErr.Code {
	case "23P01": // exclusion_violation
		return &BookingError{
			Code:       ErrExclusionViolation,
			Message:    fmt.Sprintf("Exclusion constraint violated: %s", pqErr.Detail),
			UserSafe:   "This time slot is no longer available. Please select another time.",
			Retryable:  true,
			HTTPStatus: 409,
		}

	case "23505": // unique_violation
		// Check if it's idempotency key violation from error message
		if containsString(pqErr.Message, "idempotency_key") || containsString(pqErr.Detail, "idempotency_key") {
			return &BookingError{
				Code:       ErrBookingAlreadyExists,
				Message:    "Unique constraint violated on idempotency_key",
				UserSafe:   "This booking already exists.",
				Retryable:  false,
				HTTPStatus: 409,
			}
		}
		return &BookingError{
			Code:       ErrUniqueViolation,
			Message:    fmt.Sprintf("Unique constraint violated: %s", pqErr.Message),
			UserSafe:   "A duplicate record already exists.",
			Retryable:  false,
			HTTPStatus: 409,
		}

	case "23503": // foreign_key_violation
		return &BookingError{
			Code:       ErrForeignKeyViolation,
			Message:    fmt.Sprintf("Foreign key constraint violated: %s", pqErr.Detail),
			UserSafe:   "The referenced resource does not exist.",
			Retryable:  false,
			HTTPStatus: 400,
		}

	case "40001": // serialization_failure
		return &BookingError{
			Code:       ErrSerializationFailure,
			Message:    "Transaction serialization failure",
			UserSafe:   "Please try again in a moment. The system is busy.",
			Retryable:  true,
			HTTPStatus: 409,
		}

	case "40P01": // deadlock_detected
		return &BookingError{
			Code:       ErrDeadlockDetected,
			Message:    "Deadlock detected",
			UserSafe:   "Please try again in a moment. The system is busy.",
			Retryable:  true,
			HTTPStatus: 409,
		}

	case "55P03": // lock_not_available
		return &BookingError{
			Code:       ErrLockTimeout,
			Message:    "Lock acquisition timeout",
			UserSafe:   "The system is busy. Please try again in a moment.",
			Retryable:  true,
			HTTPStatus: 408,
		}

	default:
		// Unknown PostgreSQL error
		return &BookingError{
			Code:       ErrDatabaseError,
			Message:    fmt.Sprintf("PostgreSQL error %s: %s", pqErr.Code, pqErr.Error()),
			UserSafe:   "A database error occurred. Please try again later.",
			Retryable:  isRetryableDBError(string(pqErr.Code)),
			HTTPStatus: 500,
		}
	}
}

// isRetryableDBError checks if a PostgreSQL error code is retryable
func isRetryableDBError(code string) bool {
	switch code {
	case "40001", // serialization_failure
		"40P01", // deadlock_detected
		"55P03", // lock_not_available
		"57014", // query_canceled
		"08000", // connection_exception
		"08003", // connection_does_not_exist
		"08006": // connection_failure
		return true
	default:
		return false
	}
}

// NewBookingError creates a new booking error with all fields
func NewBookingError(code, message, userSafe string, retryable bool, httpStatus int) *BookingError {
	return &BookingError{
		Code:       code,
		Message:    message,
		UserSafe:   userSafe,
		Retryable:  retryable,
		HTTPStatus: httpStatus,
	}
}

// NewValidationError creates a new validation error
func NewValidationError(field, message string) *BookingError {
	return &BookingError{
		Code:       ErrValidationFailed,
		Message:    fmt.Sprintf("Validation failed for %s: %s", field, message),
		UserSafe:   fmt.Sprintf("Invalid input: %s", message),
		Retryable:  false,
		HTTPStatus: 400,
	}
}

// NewBookingConflictError creates a new booking conflict error
func NewBookingConflictError(message string) *BookingError {
	return &BookingError{
		Code:       ErrBookingConflict,
		Message:    message,
		UserSafe:   "This time slot is no longer available. Please select another time.",
		Retryable:  true,
		HTTPStatus: 409,
	}
}

// NewNotFoundError creates a new not found error
func NewNotFoundError(resourceType, id string) *BookingError {
	return &BookingError{
		Code:       ErrBookingNotFound,
		Message:    fmt.Sprintf("%s not found: %s", resourceType, id),
		UserSafe:   fmt.Sprintf("The requested %s was not found.", resourceType),
		Retryable:  false,
		HTTPStatus: 404,
	}
}
