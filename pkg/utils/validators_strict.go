package utils

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// UUIDRegex - Strict UUID validation (lowercase hex only)
var UUIDRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// IdempotencyKeyRegex - Allow alphanumeric, dash, underscore (no SQL chars)
var IdempotencyKeyRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// ValidateUUIDStrict validates UUID with strict format (lowercase hex only)
func ValidateUUIDStrict(value string, fieldName string) ValidationResult {
	if value == "" {
		return ValidationResult{
			Valid:   false,
			Error:   "EMPTY_UUID",
			Message: fmt.Sprintf("%s cannot be empty", fieldName),
		}
	}

	// Strict UUID regex (no injection possible, no uppercase, no unicode)
	if !UUIDRegex.MatchString(value) {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_UUID_FORMAT",
			Message: fmt.Sprintf("%s must be a valid UUID (lowercase hex, e.g. 00000000-0000-0000-0000-000000000001)", fieldName),
		}
	}

	return ValidationResult{Valid: true}
}

// ValidateIdempotencyKey validates key with strict format and length limit
func ValidateIdempotencyKey(key string) ValidationResult {
	if key == "" {
		return ValidationResult{
			Valid:   false,
			Error:   "EMPTY_KEY",
			Message: "idempotency_key cannot be empty",
		}
	}

	// Length limit (255 chars max for PostgreSQL VARCHAR)
	if len(key) > 255 {
		return ValidationResult{
			Valid:   false,
			Error:   "KEY_TOO_LONG",
			Message: fmt.Sprintf("idempotency_key must be <= 255 chars (got %d)", len(key)),
		}
	}

	// Minimum length
	if len(key) < 5 {
		return ValidationResult{
			Valid:   false,
			Error:   "KEY_TOO_SHORT",
			Message: fmt.Sprintf("idempotency_key must be >= 5 chars (got %d)", len(key)),
		}
	}

	// Reject SQL injection chars (should be caught by regex, but defense in depth)
	if strings.ContainsAny(key, "';\"\\--/*") {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_CHARS",
			Message: "idempotency_key contains invalid characters (SQL injection attempt?)",
		}
	}

	// Reject null bytes
	if strings.Contains(key, "\x00") {
		return ValidationResult{
			Valid:   false,
			Error:   "NULL_BYTE",
			Message: "idempotency_key cannot contain null bytes",
		}
	}

	// Strict regex (alphanumeric, dash, underscore only)
	if !IdempotencyKeyRegex.MatchString(key) {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_KEY_FORMAT",
			Message: "idempotency_key must contain only alphanumeric characters, dashes, and underscores",
		}
	}

	return ValidationResult{Valid: true}
}

// ValidateStringSafe validates string with sanitization and length limits
func ValidateStringSafe(value string, fieldName string, maxLength int) ValidationResult {
	if value == "" {
		return ValidationResult{
			Valid:   false,
			Error:   "EMPTY_STRING",
			Message: fmt.Sprintf("%s cannot be empty", fieldName),
		}
	}

	// Length limit
	if len(value) > maxLength {
		return ValidationResult{
			Valid:   false,
			Error:   "STRING_TOO_LONG",
			Message: fmt.Sprintf("%s must be <= %d chars (got %d)", fieldName, maxLength, len(value)),
		}
	}

	// Reject null bytes
	if strings.Contains(value, "\x00") {
		return ValidationResult{
			Valid:   false,
			Error:   "NULL_BYTE",
			Message: fmt.Sprintf("%s cannot contain null bytes", fieldName),
		}
	}

	// Reject unicode control characters (except common whitespace)
	for _, r := range value {
		if r < 32 && r != '\t' && r != '\n' && r != '\r' {
			return ValidationResult{
				Valid:   false,
				Error:   "INVALID_CONTROL_CHAR",
				Message: fmt.Sprintf("%s contains invalid control character (U+%04X)", fieldName, r),
			}
		}
	}

	return ValidationResult{Valid: true}
}

// ValidateDuration validates duration in minutes
func ValidateDuration(minutes int, fieldName string) ValidationResult {
	const (
		MinDuration = 15  // 15 minutes minimum
		MaxDuration = 480 // 8 hours maximum
	)

	if minutes < MinDuration {
		return ValidationResult{
			Valid:   false,
			Error:   "DURATION_TOO_SHORT",
			Message: fmt.Sprintf("%s must be >= %d minutes (got %d)", fieldName, MinDuration, minutes),
		}
	}

	if minutes > MaxDuration {
		return ValidationResult{
			Valid:   false,
			Error:   "DURATION_TOO_LONG",
			Message: fmt.Sprintf("%s must be <= %d minutes (got %d)", fieldName, MaxDuration, minutes),
		}
	}

	return ValidationResult{Valid: true}
}

// ValidateTimezoneOffset validates timezone offset format (+HH:MM or -HH:MM)
func ValidateTimezoneOffset(offset string) ValidationResult {
	if offset == "" {
		// Default is acceptable
		return ValidationResult{Valid: true}
	}

	// Must be exactly 6 chars: +HH:MM or -HH:MM
	if len(offset) != 6 {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_FORMAT",
			Message: "timezone offset must be in format +HH:MM or -HH:MM (e.g. -03:00)",
		}
	}

	// First char must be + or -
	if offset[0] != '+' && offset[0] != '-' {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_SIGN",
			Message: "timezone offset must start with + or -",
		}
	}

	// Position 4 must be :
	if offset[3] != ':' {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_SEPARATOR",
			Message: "timezone offset must have : at position 4",
		}
	}

	// Validate hour and minute are numeric
	hour := offset[1:3]
	minute := offset[4:6]

	if !isNumeric(hour) || !isNumeric(minute) {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_NUMERIC",
			Message: "timezone offset hours and minutes must be numeric",
		}
	}

	// Parse and validate ranges
	hourInt := parseInt(hour)
	minuteInt := parseInt(minute)

	if hourInt < -14 || hourInt > 14 {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_HOUR",
			Message: "timezone offset hours must be between -14 and +14",
		}
	}

	if minuteInt < 0 || minuteInt > 59 {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_TZ_MINUTE",
			Message: "timezone offset minutes must be between 00 and 59",
		}
	}

	return ValidationResult{Valid: true}
}

// parseInt helper para convertir string a int
// ValidateISODate validates date in YYYY-MM-DD format
func ValidateISODate(value string, fieldName string) ValidationResult {
	if value == "" {
		return ValidationResult{
			Valid:   false,
			Error:   "EMPTY_DATE",
			Message: fmt.Sprintf("%s cannot be empty", fieldName),
		}
	}

	// Must match YYYY-MM-DD format
	dateRegex := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	if !dateRegex.MatchString(value) {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_DATE_FORMAT",
			Message: fmt.Sprintf("%s must be in YYYY-MM-DD format", fieldName),
		}
	}

	// Try to parse and validate it's a real date
	_, err := time.Parse("2006-01-02", value)
	if err != nil {
		return ValidationResult{
			Valid:   false,
			Error:   "INVALID_DATE",
			Message: fmt.Sprintf("%s is not a valid date: %v", fieldName, err),
		}
	}

	return ValidationResult{Valid: true}
}

// ValidateHoursArray validates array of hours (0-23)
func ValidateHoursArray(hours []int) ValidationResult {
	if len(hours) == 0 {
		return ValidationResult{
			Valid:   false,
			Error:   "EMPTY_HOURS",
			Message: "hours array cannot be empty",
		}
	}

	if len(hours) > 24 {
		return ValidationResult{
			Valid:   false,
			Error:   "HOURS_TOO_MANY",
			Message: "hours array cannot have more than 24 entries",
		}
	}

	for i, hour := range hours {
		if hour < 0 || hour > 23 {
			return ValidationResult{
				Valid:   false,
				Error:   "INVALID_HOUR",
				Message: fmt.Sprintf("hour at index %d must be 0-23 (got %d)", i, hour),
			}
		}
	}

	return ValidationResult{Valid: true}
}

// isNumeric checks if string contains only digits
func isNumeric(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// parseInt helper para convertir string a int
func parseInt(s string) int {
	result := 0
	for _, r := range s {
		result = result*10 + int(r-'0')
	}
	return result
}
