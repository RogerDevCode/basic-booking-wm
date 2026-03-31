package go_tests

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"booking-titanium-wm/internal/availability"
	"booking-titanium-wm/internal/communication"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/providers"
)

func loadLocalEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var currentKey string
	var currentValue strings.Builder
	inMultiLine := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if !inMultiLine {
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])

			if strings.HasPrefix(val, "{") || strings.HasPrefix(val, "'{") || strings.HasPrefix(val, "\"{") {
				inMultiLine = true
				currentKey = key
				currentValue.Reset()
				val = strings.TrimPrefix(val, "'")
				val = strings.TrimPrefix(val, "\"")
				currentValue.WriteString(val)
				if strings.HasSuffix(val, "}") {
					inMultiLine = false
					os.Setenv(currentKey, currentValue.String())
				}
			} else {
				os.Setenv(key, strings.Trim(val, "\"'"))
			}
		} else {
			currentValue.WriteString("\n")
			val := strings.TrimSpace(line)
			currentValue.WriteString(val)
			if strings.HasSuffix(val, "}") || strings.HasSuffix(val, "}'") || strings.HasSuffix(val, "}\"") {
				inMultiLine = false
				finalVal := strings.TrimSuffix(currentValue.String(), "'")
				finalVal = strings.TrimSuffix(finalVal, "\"")
				os.Setenv(currentKey, finalVal)
			}
		}
	}
}

func TestLeafLogic_HappyPath(t *testing.T) {
	// Load environment if local (try multiple paths)
	envPaths := []string{"../../docker-compose/.env", "docker-compose/.env", "../docker-compose/.env"}
	for _, p := range envPaths {
		if _, err := os.Stat(p); err == nil {
			loadLocalEnv(p)
			break
		}
	}

	// Mappings
	if os.Getenv("TELEGRAM_BOT_TOKEN") == "" && os.Getenv("TELEGRAM_TOKEN") != "" {
		os.Setenv("TELEGRAM_BOT_TOKEN", os.Getenv("TELEGRAM_TOKEN"))
	}
	if os.Getenv("GMAIL_USERNAME") == "" {
		if u := os.Getenv("GMAIL_USER"); u != "" {
			os.Setenv("GMAIL_USERNAME", u)
		} else if u := os.Getenv("DEV_LOCAL_GMAIL_USER"); u != "" {
			os.Setenv("GMAIL_USERNAME", u)
		}
	}
	if os.Getenv("GMAIL_PASSWORD") == "" {
		if p := os.Getenv("DEV_LOCAL_GMAIL_PASS"); p != "" {
			os.Setenv("GMAIL_PASSWORD", p)
		}
	}
	// Neon SSL Force
	dbURL := os.Getenv("DATABASE_URL")
	if strings.Contains(dbURL, "neon.tech") && !strings.Contains(dbURL, "sslmode=require") {
		if strings.Contains(dbURL, "sslmode=disable") {
			dbURL = strings.Replace(dbURL, "sslmode=disable", "sslmode=require", 1)
		} else if !strings.Contains(dbURL, "sslmode=") {
			if strings.Contains(dbURL, "?") {
				dbURL += "&sslmode=require"
			} else {
				dbURL += "?sslmode=require"
			}
		}
		os.Setenv("DATABASE_URL", dbURL)
	}

	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("Skipping leaf logic tests: DATABASE_URL not set")
	}

	// Setup: Need system config for many leaf operations
	config.Init()

	// 1. Logic for f/get_providers
	t.Run("internal/providers.GetProviders", func(t *testing.T) {
		resp := providers.GetProviders()
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("GetProviders failed: %s", msg)
		} else {
			fmt.Printf("✅ GetProviders: Found providers in DB\n")
		}
	})

	// 2. Logic for f/get_services
	t.Run("internal/providers.GetServices", func(t *testing.T) {
		resp := providers.GetServices()
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("GetServices failed: %s", msg)
		} else {
			fmt.Printf("✅ GetServices: Found services in DB\n")
		}
	})

	// 3. Logic for f/availability_check
	t.Run("internal/availability.CheckAvailability", func(t *testing.T) {
		cfg := config.GetSystemConfig()
		date := time.Now().Add(48 * time.Hour).Format("2006-01-02")
		
		resp := availability.CheckAvailability(cfg.ProviderID, cfg.ServiceID, date)
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("CheckAvailability failed: %s", msg)
		} else {
			fmt.Printf("✅ CheckAvailability: Successfully checked slots for %s\n", date)
		}
	})

	// 4. Logic for f/telegram_send
	t.Run("internal/communication.SendMessage", func(t *testing.T) {
		chatID := os.Getenv("TELEGRAM_ID")
		if chatID == "" { t.Skip("TELEGRAM_ID not set") }
		
		resp := communication.SendMessage(chatID, "🧪 *Logic Test*: Telegram Leaf", "MarkdownV2")
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("SendMessage failed: %s", msg)
		} else {
			fmt.Println("✅ SendMessage: Success")
		}
	})

	// 5. Logic for f/gmail_send
	t.Run("internal/communication.SendEmail", func(t *testing.T) {
		user := os.Getenv("GMAIL_USERNAME")
		if user == "" { t.Skip("GMAIL_USERNAME not set") }
		
		req := communication.SendEmailRequest{
			ToEmail: user,
			Subject: "🧪 Logic Test: Gmail Leaf",
			Body:    "Testing the internal communication package logic.",
		}
		resp := communication.SendEmail(req)
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("SendEmail failed: %s", msg)
		} else {
			fmt.Println("✅ SendEmail: Success")
		}
	})

	// 6. Logic for f/gcal_create_event
	t.Run("internal/communication.CreateEvent", func(t *testing.T) {
		if os.Getenv("GOOGLE_CREDENTIALS_JSON") == "" { t.Skip("GCal creds missing") }
		
		startTime := time.Now().Add(3 * time.Hour).Format(time.RFC3339)
		resp := communication.CreateEvent(startTime, "Logic Test: GCal", "Testing internal package", "primary")
		
		if !resp.Success {
			msg := "unknown"
			if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
			t.Errorf("CreateEvent failed: %s", msg)
		} else {
			fmt.Println("✅ CreateEvent: Success")
			// Cleanup
			if resp.Data != nil {
				if id, ok := (*resp.Data)["event_id"].(string); ok {
					communication.DeleteEvent(id, "primary")
				}
			}
		}
	})
}
