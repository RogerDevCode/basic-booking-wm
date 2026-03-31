package go_tests

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"booking-titanium-wm/internal/ai"
	"booking-titanium-wm/internal/communication"
	"booking-titanium-wm/internal/core/db"
)

func loadLocalEnv(path string) {
	fmt.Printf("🔍 Opening env file at: %s\n", path)
	file, err := os.Open(path)
	if err != nil {
		fmt.Printf("❌ Failed to open env file: %v\n", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var currentKey string
	var currentValue strings.Builder
	inMultiLine := false

	count := 0
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
			fmt.Printf("  - Found key: %s\n", key)

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
					count++
				}
			} else {
				os.Setenv(key, strings.Trim(val, "\"'"))
				count++
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
				count++
			}
		}
	}
	fmt.Printf("✅ Loaded %d variables from env file\n", count)
}

// TestMain strictly relies on Environment Variables.
// No .env files are loaded.
func TestMain(m *testing.M) {
	fmt.Println("🚀 Running Connection Happy Path Tests")
	
	// Load from docker-compose/.env IF it exists (Local Dev Support only)
	// This does NOT use a root .env file.
	if _, err := os.Stat("../../docker-compose/.env"); err == nil {
		fmt.Println("📎 Loading variables from docker-compose/.env for local test session...")
		// Simple internal parser to avoid external dependencies
		loadLocalEnv("../../docker-compose/.env")
	}

	// Apply Multiplexer Mappings
	
	// Telegram Mapping
	if os.Getenv("TELEGRAM_BOT_TOKEN") == "" && os.Getenv("TELEGRAM_TOKEN") != "" {
		os.Setenv("TELEGRAM_BOT_TOKEN", os.Getenv("TELEGRAM_TOKEN"))
	}

	// Gmail Mapping (Multiplexer Style)
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

	// Print Summary of Available Services
	services := map[string]string{
		"Postgres": os.Getenv("DATABASE_URL"),
		"Telegram": os.Getenv("TELEGRAM_BOT_TOKEN"),
		"Gmail":    os.Getenv("GMAIL_PASSWORD"),
		"GCal":     os.Getenv("GOOGLE_CREDENTIALS_JSON"),
		"AI":       os.Getenv("GROQ_API_KEY"),
	}

	fmt.Println("📊 Service Availability (from env):")
	for name, val := range services {
		status := "❌ MISSING"
		if val != "" {
			status = "✅ PRESENT"
		}
		fmt.Printf(" - %s: %s\n", name, status)
	}

	os.Exit(m.Run())
}

// 1. PostgreSQL Happy Path
func TestPostgres_HappyPath(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}

	// Force require for Neon
	if strings.Contains(dbURL, "neon.tech") && !strings.Contains(dbURL, "sslmode=require") {
		if strings.Contains(dbURL, "sslmode=disable") {
			dbURL = strings.Replace(dbURL, "sslmode=disable", "sslmode=require", 1)
		} else {
			if strings.Contains(dbURL, "?") {
				dbURL += "&sslmode=require"
			} else {
				dbURL += "?sslmode=require"
			}
		}
		os.Setenv("DATABASE_URL", dbURL)
	}

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to initialize database connection")
	}

	err := database.PingContext(ctx)
	if err != nil {
		t.Fatalf("Postgres ping failed: %v", err)
	}

	fmt.Println("✅ Postgres Happy Path: PASS")
}

// 2. Telegram Happy Path
func TestTelegram_HappyPath(t *testing.T) {
	chatID := os.Getenv("TELEGRAM_ID")
	if chatID == "" {
		t.Skip("TELEGRAM_ID not set")
	}

	resp := communication.SendMessage(chatID, "🚀 *Happy Path*: Env Var Mode", "MarkdownV2")
	if !resp.Success {
		msg := "Unknown"
		if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
		t.Errorf("Telegram failed: %s", msg)
	} else {
		fmt.Println("✅ Telegram Happy Path: PASS")
	}
}

// 3. Gmail Happy Path
func TestGmail_HappyPath(t *testing.T) {
	user := os.Getenv("GMAIL_USERNAME")
	pass := os.Getenv("GMAIL_PASSWORD")
	if user == "" || pass == "" {
		t.Skip("Gmail credentials missing")
	}

	req := communication.SendEmailRequest{
		ToEmail: user,
		Subject: "🧪 Happy Path: Environment Variables",
		Body:    "SMTP connection verified using direct environment exports.",
	}
	resp := communication.SendEmail(req)
	if !resp.Success {
		msg := "Unknown"
		if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
		t.Errorf("Gmail failed: %s", msg)
	} else {
		fmt.Println("✅ Gmail Happy Path: PASS")
	}
}

// 4. Google Calendar Happy Path
func TestGCal_HappyPath(t *testing.T) {
	if os.Getenv("GOOGLE_CREDENTIALS_JSON") == "" {
		t.Skip("GOOGLE_CREDENTIALS_JSON not set")
	}

	calendarID := os.Getenv("GCALENDAR_ID")
	if calendarID == "" { calendarID = "primary" }

	startTime := time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	
	resp := communication.CreateEvent(startTime, "Happy Path: Env Var", "Testing", calendarID)
	if !resp.Success {
		msg := "Unknown"
		if resp.ErrorMessage != nil { msg = *resp.ErrorMessage }
		t.Fatalf("GCal Create failed: %s", msg)
	}
	
	data := *resp.Data
	eventID := data["event_id"].(string)

	delResp := communication.DeleteEvent(eventID, calendarID)
	if !delResp.Success {
		t.Errorf("GCal Delete failed")
	} else {
		fmt.Println("✅ GCal Happy Path: PASS")
	}
}

// 5. AI Happy Path
func TestAI_HappyPath(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if os.Getenv("GROQ_API_KEY") == "" {
		t.Skip("GROQ_API_KEY not set")
	}

	intent, err := ai.ClassifyIntent(ctx, "Reserva una cita")
	if err != nil || intent.Intent == "" {
		t.Fatalf("AI failed: %v", err)
	}
	fmt.Printf("✅ AI Happy Path: PASS (Detected: %s)\n", intent.Intent)
}
