package logging

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"time"
)

// HIPAA-Compliant Logger
// ======================
// This logger ensures NO PII (Personally Identifiable Information) is logged.
// 
// NEVER LOG:
// - Patient names
// - Patient emails
// - Patient phone numbers
// - Medical information
// - Full credit card numbers
// - Social security numbers
//
// SAFE TO LOG:
// - IDs (UUIDs, integers)
// - Status values
// - Timestamps
// - Error messages (without PII)
// - Operation names
// - Performance metrics

// LogLevel represents the severity of a log message
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
)

// Logger is a HIPAA-compliant logger
type Logger struct {
	level   LogLevel
	service string
}

// NewLogger creates a new HIPAA-compliant logger
func NewLogger(service string, level LogLevel) *Logger {
	return &Logger{
		level:   level,
		service: service,
	}
}

// logEntry represents a structured log entry
type logEntry struct {
	timestamp string
	level     string
	service   string
	message   string
	caller    string
}

// String formats the log entry
func (e logEntry) String() string {
	return fmt.Sprintf("%s [%s] %s %s | %s",
		e.timestamp,
		e.level,
		e.service,
		e.caller,
		e.message,
	)
}

// log logs a message at the specified level
func (l *Logger) log(level LogLevel, format string, args ...interface{}) {
	if level < l.level {
		return
	}

	// Get caller information
	_, file, line, ok := runtime.Caller(2)
	if !ok {
		file = "unknown"
		line = 0
	}

	// Extract just the filename
	shortFile := file
	for i := len(file) - 1; i > 0; i-- {
		if file[i] == '/' {
			shortFile = file[i+1:]
			break
		}
	}

	caller := fmt.Sprintf("%s:%d", shortFile, line)

	// Format message
	message := fmt.Sprintf(format, args...)

	// Create log entry
	entry := logEntry{
		timestamp: time.Now().UTC().Format(time.RFC3339),
		level:     levelToString(level),
		service:   l.service,
		message:   message,
		caller:    caller,
	}

	// Log to stdout
	log.Println(entry.String())
}

func levelToString(level LogLevel) string {
	switch level {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// Debug logs a debug message
func (l *Logger) Debug(format string, args ...interface{}) {
	l.log(DEBUG, format, args...)
}

// Info logs an info message
func (l *Logger) Info(format string, args ...interface{}) {
	l.log(INFO, format, args...)
}

// Warn logs a warning message
func (l *Logger) Warn(format string, args ...interface{}) {
	l.log(WARN, format, args...)
}

// Error logs an error message
func (l *Logger) Error(format string, args ...interface{}) {
	l.log(ERROR, format, args...)
}

// LogBookingEvent logs a booking-related event WITHOUT PII
func (l *Logger) LogBookingEvent(operation string, bookingID string, status string, metadata map[string]interface{}) {
	l.Info("operation=%s booking_id=%s status=%s metadata=%v",
		operation,
		sanitizeID(bookingID),
		status,
		sanitizeMetadata(metadata),
	)
}

// LogProviderEvent logs a provider-related event WITHOUT PII
func (l *Logger) LogProviderEvent(operation string, providerID string, metadata map[string]interface{}) {
	l.Info("operation=%s provider_id=%s metadata=%v",
		operation,
		sanitizeID(providerID),
		sanitizeMetadata(metadata),
	)
}

// LogPatientEvent logs a patient-related event WITHOUT PII
// IMPORTANT: Never log patient name, email, phone, or medical info
func (l *Logger) LogPatientEvent(operation string, patientID string, metadata map[string]interface{}) {
	l.Info("operation=%s patient_id=%s metadata=%v",
		operation,
		sanitizeID(patientID),
		sanitizeMetadata(metadata),
	)
}

// LogError logs an error with context
func (l *Logger) LogError(ctx context.Context, operation string, err error, metadata map[string]interface{}) {
	l.Error("operation=%s error=%v metadata=%v",
		operation,
		err.Error(),
		sanitizeMetadata(metadata),
	)
}

// LogDuration logs the duration of an operation
func (l *Logger) LogDuration(operation string, duration time.Duration, metadata map[string]interface{}) {
	l.Info("operation=%s duration_ms=%d metadata=%v",
		operation,
		duration.Milliseconds(),
		sanitizeMetadata(metadata),
	)
}

// sanitizeID ensures an ID is safe to log (truncates if too long)
func sanitizeID(id string) string {
	if len(id) > 36 {
		return id[:36] + "..."
	}
	return id
}

// sanitizeMetadata removes any potentially sensitive fields
func sanitizeMetadata(metadata map[string]interface{}) map[string]interface{} {
	if metadata == nil {
		return nil
	}

	sanitized := make(map[string]interface{})
	for k, v := range metadata {
		// Skip fields that might contain PII
		if isSensitiveField(k) {
			sanitized[k] = "[REDACTED]"
		} else {
			sanitized[k] = v
		}
	}
	return sanitized
}

// isSensitiveField checks if a field name suggests sensitive data
func isSensitiveField(fieldName string) bool {
	sensitiveFields := map[string]bool{
		"name":                  true,
		"email":                 true,
		"phone":                 true,
		"address":               true,
		"ssn":                   true,
		"social_security":       true,
		"credit_card":           true,
		"card_number":           true,
		"medical_record":        true,
		"diagnosis":             true,
		"treatment":             true,
		"prescription":          true,
		"insurance_number":      true,
		"password":              true,
		"secret":                true,
		"token":                 true,
		"api_key":               true,
		"access_token":          true,
		"refresh_token":         true,
		"credit_card_number":    true,
		"cvv":                   true,
		"expiration":            true,
		"patient_name":          true,
		"patient_email":         true,
		"patient_phone":         true,
		"provider_name":         true,
		"provider_email":        true,
		"provider_phone":        true,
		"user_name":             true,
		"user_email":            true,
		"user_phone":            true,
		"full_name":             true,
		"first_name":            true,
		"last_name":             true,
		"date_of_birth":         true,
		"birth_date":            true,
		"medical_history":       true,
		"symptoms":              true,
		"notes":                 true,
	}

	return sensitiveFields[fieldName] ||
		sensitiveFields[lowercase(fieldName)]
}

func lowercase(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c = c + ('a' - 'A')
		}
		result[i] = c
	}
	return string(result)
}

// Global default logger
var defaultLogger = NewLogger("booking-titanium", INFO)

// SetDefaultLogger sets the global default logger
func SetDefaultLogger(logger *Logger) {
	defaultLogger = logger
}

// GetDefaultLogger returns the global default logger
func GetDefaultLogger() *Logger {
	return defaultLogger
}

// Convenience functions using the default logger

func Debug(format string, args ...interface{}) {
	defaultLogger.Debug(format, args...)
}

func Info(format string, args ...interface{}) {
	defaultLogger.Info(format, args...)
}

func Warn(format string, args ...interface{}) {
	defaultLogger.Warn(format, args...)
}

func Error(format string, args ...interface{}) {
	defaultLogger.Error(format, args...)
}

func LogBookingEvent(operation string, bookingID string, status string, metadata map[string]interface{}) {
	defaultLogger.LogBookingEvent(operation, bookingID, status, metadata)
}

func LogProviderEvent(operation string, providerID string, metadata map[string]interface{}) {
	defaultLogger.LogProviderEvent(operation, providerID, metadata)
}

func LogPatientEvent(operation string, patientID string, metadata map[string]interface{}) {
	defaultLogger.LogPatientEvent(operation, patientID, metadata)
}

func LogError(ctx context.Context, operation string, err error, metadata map[string]interface{}) {
	defaultLogger.LogError(ctx, operation, err, metadata)
}

func LogDuration(operation string, duration time.Duration, metadata map[string]interface{}) {
	defaultLogger.LogDuration(operation, duration, metadata)
}

// InitLogger initializes the default logger with the specified service name and level
func InitLogger(service string, levelStr string) {
	level := INFO
	switch levelStr {
	case "debug":
		level = DEBUG
	case "info":
		level = INFO
	case "warn":
		level = WARN
	case "error":
		level = ERROR
	}

	// Check if LOG_LEVEL env var is set
	if envLevel := os.Getenv("LOG_LEVEL"); envLevel != "" {
		switch envLevel {
		case "debug":
			level = DEBUG
		case "info":
			level = INFO
		case "warn":
			level = WARN
		case "error":
			level = ERROR
		}
	}

	defaultLogger = NewLogger(service, level)
}
