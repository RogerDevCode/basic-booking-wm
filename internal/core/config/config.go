package config

import (
	"os"
	"strconv"
)

// GetBookingConfig retrieves business-specific configurables and credentials.
func GetBookingConfig() map[string]any {
	cfg := map[string]any{
		"N8N_EDITOR_BASE_URL": getEnv("N8N_EDITOR_BASE_URL", "http://localhost:8080"),
		"TELEGRAM_ADMIN_ID":   getEnv("TELEGRAM_ADMIN_ID", "5391760292"),
		"BUSINESS_EMAIL":      getEnv("BUSINESS_EMAIL", "baba.orere@gmail.com"),
		"DEFAULT_PROVIDER_ID": getEnvAsInt("DEFAULT_PROVIDER_ID", 1),
		"DEFAULT_SERVICE_ID":  getEnvAsInt("DEFAULT_SERVICE_ID", 1),
		"DAL_SERVICE_URL":     getEnv("DAL_SERVICE_URL", "http://127.0.0.1:3000"),
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvAsInt(name string, fallback int) int {
	valueStr := os.Getenv(name)
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return fallback
}
