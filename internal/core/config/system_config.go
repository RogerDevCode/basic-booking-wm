package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/logging"
)

var configLog = logging.GetDefaultLogger()

// ============================================================================
// SYSTEM CONFIG STRUCT
// ============================================================================

// SystemConfig represents the single-provider/single-service system configuration
type SystemConfig struct {
	ProviderID             string `json:"provider_id"`              // UUID del único proveedor
	ServiceID              string `json:"service_id"`               // UUID del único servicio
	GCalCalendarID         string `json:"gcal_calendar_id"`         // Google Calendar ID del proveedor
	ServiceDurationMin     int    `json:"service_duration_min"`     // Duración en minutos
	ServiceBufferMin       int    `json:"service_buffer_min"`       // Buffer entre citas
	BookingMaxAdvanceDays  int    `json:"booking_max_advance_days"` // Días máximos de anticipación
	BookingMinAdvanceHours int    `json:"booking_min_advance_hours"`// Horas mínimas de anticipación
}

// ============================================================================
// SINGLETON PATTERN WITH CACHE
// ============================================================================

var (
	configInstance *SystemConfig
	configOnce     sync.Once
	configMutex    sync.RWMutex
)

// GetSystemConfig returns the cached system configuration
// Uses sync.Once for thread-safe lazy initialization
func GetSystemConfig() *SystemConfig {
	configOnce.Do(func() {
		configInstance = loadConfigFromDB()
	})

	configMutex.RLock()
	defer configMutex.RUnlock()

	return configInstance
}

// RefreshConfig reloads configuration from database
// Call this when config changes or on cache miss
func RefreshConfig() {
	configMutex.Lock()
	defer configMutex.Unlock()

	configLog.Info("Refreshing system configuration from database")
	configInstance = loadConfigFromDB()
}

// StartConfigRefresher starts a background goroutine that refreshes config periodically
// Call this once during application startup
func StartConfigRefresher(interval time.Duration) {
	if interval == 0 {
		interval = 5 * time.Minute // Default: 5 minutes
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			RefreshConfig()
		}
	}()

	configLog.Info("Config refresher started (interval: %v)", interval)
}

// ============================================================================
// CONFIG LOADING
// ============================================================================

func loadConfigFromDB() *SystemConfig {
	cfg := &SystemConfig{
		// Default values
		ServiceDurationMin:     60,
		ServiceBufferMin:       10,
		BookingMaxAdvanceDays:  90,
		BookingMinAdvanceHours: 2,
	}

	// Try to load from DB
	database := db.GetDB()
	if database == nil {
		configLog.Warn("Database not initialized, using environment variables")
		return loadConfigFromEnv()
	}

	query := `SELECT config_key, config_value FROM system_config`

	rows, err := database.Query(query)
	if err != nil {
		configLog.Warn("Failed to load config from DB, using environment variables: %v", err)
		return loadConfigFromEnv()
	}
	defer rows.Close()

	loadCount := 0
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			configLog.Error("Failed to scan config row: %v", err)
			continue
		}

		loadCount++
		switch key {
		case "single_provider_id":
			cfg.ProviderID = strings.TrimSpace(value)
		case "single_service_id":
			cfg.ServiceID = strings.TrimSpace(value)
		case "service_duration_min":
			cfg.ServiceDurationMin, _ = strconv.Atoi(value)
		case "service_buffer_min":
			cfg.ServiceBufferMin, _ = strconv.Atoi(value)
		case "gcal_calendar_id":
			cfg.GCalCalendarID = strings.TrimSpace(value)
		case "booking_max_advance_days":
			cfg.BookingMaxAdvanceDays, _ = strconv.Atoi(value)
		case "booking_min_advance_hours":
			cfg.BookingMinAdvanceHours, _ = strconv.Atoi(value)
		}
	}

	if err := rows.Err(); err != nil {
		configLog.Error("Error iterating config rows: %v", err)
		return loadConfigFromEnv()
	}

	if loadCount == 0 {
		configLog.Warn("No config found in DB, using environment variables")
		return loadConfigFromEnv()
	}

	// Validate required fields
	if cfg.ProviderID == "" || cfg.ServiceID == "" {
		configLog.Error("ProviderID or ServiceID is empty, using environment variables")
		return loadConfigFromEnv()
	}

	// If GCalCalendarID not in system_config table, load from providers table
	if cfg.GCalCalendarID == "" {
		var gcalCalID string
		err := database.QueryRow("SELECT gcal_calendar_id FROM providers WHERE id = $1", cfg.ProviderID).Scan(&gcalCalID)
		if err == nil && gcalCalID != "" {
			cfg.GCalCalendarID = gcalCalID
		} else {
			cfg.GCalCalendarID = "primary"
		}
	}

	configLog.Info("System configuration loaded from DB: provider_id=%s, service_id=%s, gcal_calendar=%s",
		maskUUID(cfg.ProviderID), maskUUID(cfg.ServiceID), cfg.GCalCalendarID[:min(30, len(cfg.GCalCalendarID))]+"...")

	return cfg
}

func loadConfigFromEnv() *SystemConfig {
	gcalCalID := strings.TrimSpace(os.Getenv("GCAL_CALENDAR_ID"))
	if gcalCalID == "" {
		gcalCalID = "primary"
	}

	cfg := &SystemConfig{
		ProviderID:             strings.TrimSpace(os.Getenv("SINGLE_PROVIDER_ID")),
		ServiceID:              strings.TrimSpace(os.Getenv("SINGLE_SERVICE_ID")),
		GCalCalendarID:         gcalCalID,
		ServiceDurationMin:     getEnvAsIntSystem("SERVICE_DURATION_MIN", 60),
		ServiceBufferMin:       getEnvAsIntSystem("SERVICE_BUFFER_MIN", 10),
		BookingMaxAdvanceDays:  getEnvAsIntSystem("BOOKING_MAX_ADVANCE_DAYS", 90),
		BookingMinAdvanceHours: getEnvAsIntSystem("BOOKING_MIN_ADVANCE_HOURS", 2),
	}

	// Validate
	if cfg.ProviderID == "" || cfg.ServiceID == "" {
		configLog.Error("CRITICAL: ProviderID or ServiceID not configured in environment")
	} else {
		configLog.Info("System configuration loaded from environment: provider_id=%s, service_id=%s",
			maskUUID(cfg.ProviderID), maskUUID(cfg.ServiceID))
	}

	return cfg
}

// getEnvAsInt reads an environment variable as integer with fallback
func getEnvAsIntSystem(name string, fallback int) int {
	if value := os.Getenv(name); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
		configLog.Warn("Invalid integer value for %s: %s, using default: %d", name, value, fallback)
	}
	return fallback
}

// maskUUID masks a UUID for logging (shows first 8 chars only)
func maskUUID(uuid string) string {
	if len(uuid) <= 8 {
		return "***"
	}
	return uuid[:8] + "-***"
}

// ============================================================================
// VALIDATION
// ============================================================================

// ValidateConfig checks if configuration is valid
func ValidateConfig() error {
	cfg := GetSystemConfig()

	if cfg.ProviderID == "" {
		return fmt.Errorf("config: ProviderID is required")
	}

	if cfg.ServiceID == "" {
		return fmt.Errorf("config: ServiceID is required")
	}

	if cfg.ServiceDurationMin <= 0 {
		return fmt.Errorf("config: ServiceDurationMin must be positive (got %d)", cfg.ServiceDurationMin)
	}

	if cfg.ServiceBufferMin < 0 {
		return fmt.Errorf("config: ServiceBufferMin cannot be negative (got %d)", cfg.ServiceBufferMin)
	}

	if cfg.BookingMaxAdvanceDays <= 0 {
		return fmt.Errorf("config: BookingMaxAdvanceDays must be positive")
	}

	if cfg.BookingMinAdvanceHours < 0 {
		return fmt.Errorf("config: BookingMinAdvanceHours cannot be negative")
	}

	// Validate UUID format (basic check)
	if !isValidUUID(cfg.ProviderID) {
		return fmt.Errorf("config: ProviderID is not a valid UUID format")
	}

	if !isValidUUID(cfg.ServiceID) {
		return fmt.Errorf("config: ServiceID is not a valid UUID format")
	}

	return nil
}

// isValidUUID performs a basic UUID format validation
func isValidUUID(uuid string) bool {
	// Basic UUID format check (8-4-4-4-12 hex chars)
	if len(uuid) != 36 {
		return false
	}

	// Check for hyphens at correct positions
	if uuid[8] != '-' || uuid[13] != '-' || uuid[18] != '-' || uuid[23] != '-' {
		return false
	}

	// Check that other characters are hex
	for i, c := range uuid {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			continue
		}
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}

	return true
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// GetProviderID returns the single provider ID
func GetProviderID() string {
	return GetSystemConfig().ProviderID
}

// GetServiceID returns the single service ID
func GetServiceID() string {
	return GetSystemConfig().ServiceID
}

// GetServiceDuration returns the service duration in minutes
func GetServiceDuration() int {
	return GetSystemConfig().ServiceDurationMin
}

// GetServiceBuffer returns the buffer time in minutes
func GetServiceBuffer() int {
	return GetSystemConfig().ServiceBufferMin
}

// GetBookingMaxAdvanceDays returns the maximum advance booking days
func GetBookingMaxAdvanceDays() int {
	return GetSystemConfig().BookingMaxAdvanceDays
}

// GetBookingMinAdvanceHours returns the minimum advance booking hours
func GetBookingMinAdvanceHours() int {
	return GetSystemConfig().BookingMinAdvanceHours
}

// GetGCalCalendarID returns the Google Calendar ID for the provider
func GetGCalCalendarID() string {
	return GetSystemConfig().GCalCalendarID
}

// GetServiceEndTime calculates the end time for a booking given start time
func GetServiceEndTime(startTime time.Time) time.Time {
	duration := GetServiceDuration()
	return startTime.Add(time.Duration(duration) * time.Minute)
}

// GetServiceEndTimeWithBuffer calculates the end time including buffer
func GetServiceEndTimeWithBuffer(startTime time.Time) time.Time {
	duration := GetServiceDuration() + GetServiceBuffer()
	return startTime.Add(time.Duration(duration) * time.Minute)
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Init initializes the configuration system
// Call this once during application startup
func Init() error {
	configLog.Info("Initializing system configuration...")

	// Load config
	cfg := GetSystemConfig()

	// Validate
	if err := ValidateConfig(); err != nil {
		return fmt.Errorf("config validation failed: %w", err)
	}

	// Start refresher
	StartConfigRefresher(5 * time.Minute)

	configLog.Info("System configuration initialized successfully")
	configLog.Info("  Provider ID: %s", maskUUID(cfg.ProviderID))
	configLog.Info("  Service ID: %s", maskUUID(cfg.ServiceID))
	configLog.Info("  Duration: %d min", cfg.ServiceDurationMin)
	configLog.Info("  Buffer: %d min", cfg.ServiceBufferMin)
	configLog.Info("  Max Advance: %d days", cfg.BookingMaxAdvanceDays)
	configLog.Info("  Min Advance: %d hours", cfg.BookingMinAdvanceHours)

	return nil
}
