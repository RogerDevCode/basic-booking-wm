package config

import (
	"os"
	"testing"
)

func TestGetBookingConfig_Defaults(t *testing.T) {
	// Temporarily clear environment variables that might be set locally
	os.Unsetenv("N8N_EDITOR_BASE_URL")
	os.Unsetenv("TELEGRAM_ADMIN_ID")
	os.Unsetenv("BUSINESS_EMAIL")
	os.Unsetenv("DEFAULT_PROVIDER_ID")
	os.Unsetenv("DEFAULT_SERVICE_ID")
	os.Unsetenv("DAL_SERVICE_URL")

	cfg := GetBookingConfig()

	if cfg["N8N_EDITOR_BASE_URL"] != "http://localhost:8080" {
		t.Errorf("Expected N8N_EDITOR_BASE_URL=http://localhost:8080, got %v", cfg["N8N_EDITOR_BASE_URL"])
	}
	if cfg["TELEGRAM_ADMIN_ID"] != "5391760292" {
		t.Errorf("Expected TELEGRAM_ADMIN_ID=5391760292, got %v", cfg["TELEGRAM_ADMIN_ID"])
	}
	if cfg["BUSINESS_EMAIL"] != "baba.orere@gmail.com" {
		t.Errorf("Expected BUSINESS_EMAIL=baba.orere@gmail.com, got %v", cfg["BUSINESS_EMAIL"])
	}
	if cfg["DEFAULT_PROVIDER_ID"] != 1 {
		t.Errorf("Expected DEFAULT_PROVIDER_ID=1, got %v", cfg["DEFAULT_PROVIDER_ID"])
	}
	if cfg["DEFAULT_SERVICE_ID"] != 1 {
		t.Errorf("Expected DEFAULT_SERVICE_ID=1, got %v", cfg["DEFAULT_SERVICE_ID"])
	}
	if cfg["DAL_SERVICE_URL"] != "http://127.0.0.1:3000" {
		t.Errorf("Expected DAL_SERVICE_URL=http://127.0.0.1:3000, got %v", cfg["DAL_SERVICE_URL"])
	}
}

func TestGetBookingConfig_EnvOverrides(t *testing.T) {
	os.Setenv("N8N_EDITOR_BASE_URL", "https://prod.n8n.io")
	os.Setenv("TELEGRAM_ADMIN_ID", "123456")
	os.Setenv("BUSINESS_EMAIL", "test@test.com")
	os.Setenv("DEFAULT_PROVIDER_ID", "99")
	os.Setenv("DEFAULT_SERVICE_ID", "100")
	os.Setenv("DAL_SERVICE_URL", "https://api.test.com")

	defer func() {
		os.Unsetenv("N8N_EDITOR_BASE_URL")
		os.Unsetenv("TELEGRAM_ADMIN_ID")
		os.Unsetenv("BUSINESS_EMAIL")
		os.Unsetenv("DEFAULT_PROVIDER_ID")
		os.Unsetenv("DEFAULT_SERVICE_ID")
		os.Unsetenv("DAL_SERVICE_URL")
	}()

	cfg := GetBookingConfig()

	if cfg["N8N_EDITOR_BASE_URL"] != "https://prod.n8n.io" {
		t.Errorf("Expected override N8N_EDITOR_BASE_URL=https://prod.n8n.io, got %v", cfg["N8N_EDITOR_BASE_URL"])
	}
	if cfg["TELEGRAM_ADMIN_ID"] != "123456" {
		t.Errorf("Expected override TELEGRAM_ADMIN_ID=123456, got %v", cfg["TELEGRAM_ADMIN_ID"])
	}
	if cfg["BUSINESS_EMAIL"] != "test@test.com" {
		t.Errorf("Expected override BUSINESS_EMAIL=test@test.com, got %v", cfg["BUSINESS_EMAIL"])
	}
	if cfg["DEFAULT_PROVIDER_ID"] != 99 {
		t.Errorf("Expected override DEFAULT_PROVIDER_ID=99, got %v", cfg["DEFAULT_PROVIDER_ID"])
	}
	if cfg["DEFAULT_SERVICE_ID"] != 100 {
		t.Errorf("Expected override DEFAULT_SERVICE_ID=100, got %v", cfg["DEFAULT_SERVICE_ID"])
	}
	if cfg["DAL_SERVICE_URL"] != "https://api.test.com" {
		t.Errorf("Expected override DAL_SERVICE_URL=https://api.test.com, got %v", cfg["DAL_SERVICE_URL"])
	}
}
