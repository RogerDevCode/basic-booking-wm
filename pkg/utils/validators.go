package utils

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"booking-titanium-wm/pkg/types"
)

// ============================================================================
// REGEX PATTERNS
// ============================================================================

var (
	patternUUID        = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	patternInt         = regexp.MustCompile(`^\d+$`)
	patternPositiveInt = regexp.MustCompile(`^[1-9]\d*$`)
	patternDate        = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	patternISODateTime = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?$`)
	patternEmail       = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	patternChatID      = regexp.MustCompile(`^\d+$`)
)

// ============================================================================
// VALIDATION RESULT
// ============================================================================

// ValidationResult representa el resultado de una validación
type ValidationResult struct {
	Valid   bool
	Error   string
	Message string
}

// CreateValidResult crea un resultado de validación válido
func CreateValidResult() ValidationResult {
	return ValidationResult{Valid: true}
}

// CreateInvalidResult crea un resultado de validación inválido
func CreateInvalidResult(error string, message string) ValidationResult {
	return ValidationResult{
		Valid:   false,
		Error:   error,
		Message: message,
	}
}

// ============================================================================
// PRIMITIVE VALIDATORS
// ============================================================================

// ValidatePositiveInt valida que un valor sea un entero positivo
func ValidatePositiveInt(value any, fieldName string) ValidationResult {
	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	switch v := value.(type) {
	case int:
		if v == 0 {
			return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
		}
		if v < 1 {
			return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be >= 1", fieldName))
		}
		return CreateValidResult()
	case int64:
		if v == 0 {
			return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
		}
		if v < 1 {
			return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be >= 1", fieldName))
		}
		return CreateValidResult()
	case float64:
		if v == 0 {
			return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
		}
		if v < 1 || v != float64(int(v)) {
			return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a positive integer", fieldName))
		}
		return CreateValidResult()
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
		}
		if !patternPositiveInt.MatchString(trimmed) {
			return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a positive integer", fieldName))
		}
		num, err := strconv.Atoi(trimmed)
		if err != nil || num < 1 {
			return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be >= 1", fieldName))
		}
		return CreateValidResult()
	default:
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a number or numeric string", fieldName))
	}
}

// ValidateUUID valida que un valor sea un UUID válido
func ValidateUUID(value any, fieldName string) ValidationResult {
	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a string", fieldName))
	}

	trimmed := strings.TrimSpace(strValue)
	if trimmed == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	if !patternUUID.MatchString(trimmed) {
		return CreateInvalidResult(types.ErrorCodeInvalidUUID, fmt.Sprintf("%s must be a valid UUID", fieldName))
	}

	return CreateValidResult()
}

// ValidateDate valida que un string sea una fecha YYYY-MM-DD válida
func ValidateDate(value any, fieldName string) ValidationResult {
	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a string", fieldName))
	}

	trimmed := strings.TrimSpace(strValue)
	if trimmed == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	// Check format
	if !patternDate.MatchString(trimmed) {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, fmt.Sprintf("%s must be in YYYY-MM-DD format", fieldName))
	}

	// Check date exists (not Feb 30, etc.)
	dateObj, err := time.Parse("2006-01-02", trimmed)
	if err != nil {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, fmt.Sprintf("%s is not a valid calendar date", fieldName))
	}

	// Check date components match
	parts := strings.Split(trimmed, "-")
	year, _ := strconv.Atoi(parts[0])
	month, _ := strconv.Atoi(parts[1])
	day, _ := strconv.Atoi(parts[2])

	if dateObj.Year() != year || int(dateObj.Month()) != month || dateObj.Day() != day {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, fmt.Sprintf("%s does not exist in the calendar", fieldName))
	}

	return CreateValidResult()
}

// ValidateISODateTime valida que un string sea ISO 8601 con timezone
func ValidateISODateTime(value any, fieldName string) ValidationResult {
	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a string", fieldName))
	}

	trimmed := strings.TrimSpace(strValue)
	if trimmed == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	// Check format with timezone
	if !patternISODateTime.MatchString(trimmed) {
		return CreateInvalidResult(
			types.ErrorCodeInvalidDatetime,
			fmt.Sprintf("%s must be ISO 8601 with timezone (e.g. 2026-04-15T09:00:00-03:00)", fieldName),
		)
	}

	// Check date is parseable
	_, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		// Try with Z suffix
		_, err = time.Parse("2006-01-02T15:04:05Z", trimmed)
		if err != nil {
			return CreateInvalidResult(types.ErrorCodeInvalidDatetime, fmt.Sprintf("%s is not a valid datetime", fieldName))
		}
	}

	return CreateValidResult()
}

// ValidateSafeString valida que un string sea seguro (sin caracteres peligrosos)
func ValidateSafeString(value any, fieldName string, maxLength int) ValidationResult {
	if value == nil {
		return CreateValidResult() // Optional field
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a string", fieldName))
	}

	if len(strValue) > maxLength {
		return CreateInvalidResult(types.ErrorCodeInvalidInput, fmt.Sprintf("%s must be <= %d chars", fieldName, maxLength))
	}

	// Check for dangerous characters
	for _, r := range strValue {
		if r == '\'' || r == ';' || r == '"' || r == '\\' {
			return CreateInvalidResult(types.ErrorCodeInvalidInput, fmt.Sprintf("%s contains invalid characters", fieldName))
		}
	}

	return CreateValidResult()
}

// ValidateChatID valida que un string sea un chat_id de Telegram
func ValidateChatID(value any) ValidationResult {
	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, "chat_id is required")
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, "chat_id must be a string")
	}

	trimmed := strings.TrimSpace(strValue)
	if trimmed == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, "chat_id is required")
	}

	if !patternChatID.MatchString(trimmed) {
		return CreateInvalidResult(types.ErrorCodeInvalidType, "chat_id must be a positive integer")
	}

	return CreateValidResult()
}

// ValidateEmail valida que un string sea un email válido
func ValidateEmail(value any, fieldName string) ValidationResult {
	if value == nil {
		return CreateValidResult() // Optional field
	}

	strValue, ok := value.(string)
	if !ok {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a string", fieldName))
	}

	trimmed := strings.TrimSpace(strValue)
	if !patternEmail.MatchString(trimmed) {
		return CreateInvalidResult(types.ErrorCodeInvalidType, fmt.Sprintf("%s must be a valid email", fieldName))
	}

	return CreateValidResult()
}

// IsAllASCII valida que un string contenga solo caracteres ASCII imprimibles
func IsAllASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] > 0x7E {
			return false
		}
	}
	return true
}

// SanitizeString limpia un string de caracteres peligrosos
func SanitizeString(s string, maxLength int) string {
	var b strings.Builder
	b.Grow(min(len(s), maxLength))

	for _, r := range s {
		if b.Len() >= maxLength {
			break
		}
		if r == '\'' || r == '"' || r == '\\' || r == ';' {
			continue // Skip dangerous characters
		}
		if unicode.IsPrint(r) {
			b.WriteRune(r)
		}
	}

	return b.String()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ============================================================================
// REQUEST VALIDATORS
// ============================================================================

// ValidateCreateBookingRequest valida un request de CreateBooking (v5.0 - UUID support)
func ValidateCreateBookingRequest(req types.CreateBookingRequest) ValidationResult {
	// provider_id (v5.0 - UUID)
	providerResult := ValidateUUID(req.ProviderID, "provider_id")
	if !providerResult.Valid {
		return providerResult
	}

	// service_id (v5.0 - UUID)
	serviceResult := ValidateUUID(req.ServiceID, "service_id")
	if !serviceResult.Valid {
		return serviceResult
	}

	// start_time
	timeResult := ValidateISODateTime(req.StartTime, "start_time")
	if !timeResult.Valid {
		return timeResult
	}

	// chat_id
	chatResult := ValidateChatID(req.ChatID)
	if !chatResult.Valid {
		return chatResult
	}

	// user_name (optional)
	if req.UserName != "" {
		nameResult := ValidateSafeString(req.UserName, "user_name", 100)
		if !nameResult.Valid {
			return nameResult
		}
	}

	// user_email (optional)
	if req.UserEmail != "" {
		emailResult := ValidateEmail(req.UserEmail, "user_email")
		if !emailResult.Valid {
			return emailResult
		}
	}

	return CreateValidResult()
}

// ValidateCancelBookingRequest valida un request de CancelBooking
func ValidateCancelBookingRequest(req types.CancelBookingRequest) ValidationResult {
	// booking_id
	bookingResult := ValidateUUID(req.BookingID, "booking_id")
	if !bookingResult.Valid {
		return bookingResult
	}

	// cancellation_reason (optional)
	if req.CancellationReason != nil {
		reasonResult := ValidateSafeString(*req.CancellationReason, "cancellation_reason", 500)
		if !reasonResult.Valid {
			return reasonResult
		}
	}

	return CreateValidResult()
}

// ValidateRescheduleBookingRequest valida un request de RescheduleBooking
func ValidateRescheduleBookingRequest(req types.RescheduleBookingRequest) ValidationResult {
	// booking_id
	bookingResult := ValidateUUID(req.BookingID, "booking_id")
	if !bookingResult.Valid {
		return bookingResult
	}

	// new_start_time
	timeResult := ValidateISODateTime(req.NewStartTime, "new_start_time")
	if !timeResult.Valid {
		return timeResult
	}

	// Check new_start_time is in the future
	newDate, err := time.Parse(time.RFC3339, req.NewStartTime)
	if err != nil {
		return CreateInvalidResult(types.ErrorCodeInvalidDatetime, "new_start_time is not parseable")
	}

	if newDate.Before(time.Now().Add(-1 * time.Minute)) {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, "new_start_time must be in the future")
	}

	return CreateValidResult()
}

// ValidateCheckAvailabilityRequest valida un request de CheckAvailability (v5.0 - UUID support)
func ValidateCheckAvailabilityRequest(req types.CheckAvailabilityRequest) ValidationResult {
	// provider_id (v5.0 - UUID)
	providerResult := ValidateUUID(req.ProviderID, "provider_id")
	if !providerResult.Valid {
		return providerResult
	}

	// service_id (v5.0 - UUID)
	serviceResult := ValidateUUID(req.ServiceID, "service_id")
	if !serviceResult.Valid {
		return serviceResult
	}

	// date
	dateResult := ValidateDate(req.Date, "date")
	if !dateResult.Valid {
		return dateResult
	}

	return CreateValidResult()
}

// ============================================================================
// IDEMPOTENCY KEY GENERATOR
// ============================================================================

// GenerateIdempotencyKey genera una idempotency key única para un booking (v5.0 - UUID support)
func GenerateIdempotencyKey(providerID string, serviceID string, startTime string, chatID string) string {
	// Normalize start_time (remove timezone for key generation)
	normalizedTime := strings.ReplaceAll(startTime, "Z", "")
	if idx := strings.Index(normalizedTime, "+"); idx != -1 {
		normalizedTime = normalizedTime[:idx]
	} else if idx := strings.LastIndex(normalizedTime, "-"); idx > 10 {
		normalizedTime = normalizedTime[:idx]
	}

	return fmt.Sprintf("booking_%s_%s_%s_%s", providerID, serviceID, normalizedTime, chatID)
}

// GenerateIdempotencyKeySingleUUID genera idempotency key para sistema single-provider (v5.0 - UUID support)
// FORMAT: booking_{service_id}_{normalized_time}_{chat_id}
func GenerateIdempotencyKeySingleUUID(serviceID string, startTime string, chatID string) string {
	// Normalize start_time (remove timezone for key generation)
	normalizedTime := strings.ReplaceAll(startTime, "Z", "")
	if idx := strings.Index(normalizedTime, "+"); idx != -1 {
		normalizedTime = normalizedTime[:idx]
	} else if idx := strings.LastIndex(normalizedTime, "-"); idx > 10 {
		normalizedTime = normalizedTime[:idx]
	}

	return fmt.Sprintf("booking_%s_%s_%s", serviceID, normalizedTime, chatID)
}

// ============================================================================
// ADDITIONAL VALIDATORS (v4.0 LAW-05)
// ============================================================================

// ValidateFutureDate validates that a date is in the future
func ValidateFutureDate(date time.Time, fieldName string) ValidationResult {
	now := time.Now().UTC()

	if date.Before(now) {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, fmt.Sprintf("%s must be in the future", fieldName))
	}

	// Check if date is too far in the future (more than 1 year)
	maxDate := now.AddDate(1, 0, 0)
	if date.After(maxDate) {
		return CreateInvalidResult(types.ErrorCodeInvalidDate, fmt.Sprintf("%s cannot be more than 1 year in the future", fieldName))
	}

	return CreateValidResult()
}

// ValidateResourceField validates that a field exists in a resource map and is not nil
func ValidateResourceField(resource map[string]interface{}, fieldName string) ValidationResult {
	if resource == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, "resource cannot be nil")
	}

	value, exists := resource[fieldName]
	if !exists {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("resource field '%s' is required", fieldName))
	}

	if value == nil {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("resource field '%s' cannot be nil", fieldName))
	}

	// Check for empty string
	if str, ok := value.(string); ok && str == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("resource field '%s' cannot be empty", fieldName))
	}

	return CreateValidResult()
}

// ValidateNonEmptyString validates that a string is not empty
func ValidateNonEmptyString(value string, fieldName string) ValidationResult {
	if value == "" {
		return CreateInvalidResult(types.ErrorCodeMissingField, fmt.Sprintf("%s is required", fieldName))
	}

	if strings.TrimSpace(value) == "" {
		return CreateInvalidResult(types.ErrorCodeInvalidInput, fmt.Sprintf("%s cannot be only whitespace", fieldName))
	}

	// Check max length (prevent DoS)
	if len(value) > 10000 {
		return CreateInvalidResult(types.ErrorCodeInvalidInput, fmt.Sprintf("%s is too long (max 10000 characters)", fieldName))
	}

	return CreateValidResult()
}

// ValidateTimeRange validates that start time is before end time
func ValidateTimeRange(startTime, endTime time.Time) ValidationResult {
	if startTime.IsZero() {
		return CreateInvalidResult(types.ErrorCodeInvalidDatetime, "start_time cannot be zero")
	}

	if endTime.IsZero() {
		return CreateInvalidResult(types.ErrorCodeInvalidDatetime, "end_time cannot be zero")
	}

	if !startTime.Before(endTime) {
		return CreateInvalidResult(types.ErrorCodeInvalidDatetime, "start_time must be before end_time")
	}

	return CreateValidResult()
}

// ValidateBookingTimes validates booking start and end times
func ValidateBookingTimes(startTime, endTime time.Time) ValidationResult {
	// Validate time range
	result := ValidateTimeRange(startTime, endTime)
	if !result.Valid {
		return result
	}

	// Validate duration (min 15 min, max 8 hours)
	duration := endTime.Sub(startTime)
	if duration < 15*time.Minute {
		return CreateInvalidResult(types.ErrorCodeInvalidInput, "duration must be at least 15 minutes")
	}
	if duration > 8*time.Hour {
		return CreateInvalidResult(types.ErrorCodeInvalidInput, "duration must be at most 8 hours")
	}

	// Validate future date
	result = ValidateFutureDate(startTime, "start_time")
	if !result.Valid {
		return result
	}

	return CreateValidResult()
}
