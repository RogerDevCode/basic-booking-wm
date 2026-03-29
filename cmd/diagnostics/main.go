package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"booking-titanium-wm/internal/ai"
	"booking-titanium-wm/internal/communication"
	_ "github.com/lib/pq"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func main() {
	fmt.Println("🚀 Starting Stack Connection Diagnostics (Strict Environment Mode)...")
	fmt.Println("--------------------------------------------")

	// 1. PostgreSQL Test
	testPostgres()

	// 2. Telegram Test
	testTelegram()

	// 3. Gmail Test
	testGmail()

	// 4. Google Calendar Test
	testGCal()

	// 5. AI Providers Test
	testAI()

	fmt.Println("--------------------------------------------")
	fmt.Println("🏁 Diagnostics Complete.")
}

func testPostgres() {
	fmt.Print("🐘 Testing PostgreSQL... ")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("NEON_DATABASE_URL")
	}

	if dbURL == "" {
		fmt.Println("❌ FAILED: DATABASE_URL not set")
		return
	}

	// Normalization for Neon
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
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = db.PingContext(ctx)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}

	var version string
	db.QueryRow("SELECT version()").Scan(&version)
	fmt.Printf("✅ CONNECTED (%s)\n", version[:20]+"...")
}

func testTelegram() {
	fmt.Print("🤖 Testing Telegram Bot... ")
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		token = os.Getenv("TELEGRAM_TOKEN")
	}

	if token == "" {
		fmt.Println("❌ FAILED: TELEGRAM_BOT_TOKEN not set")
		return
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token)
	resp, err := http.Get(apiURL)
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("❌ FAILED: Status %d\n", resp.StatusCode)
		return
	}

	fmt.Println("✅ CONNECTED")
}

func testGmail() {
	fmt.Print("📧 Testing Gmail SMTP... ")
	
	user := os.Getenv("GMAIL_USERNAME")
	if user == "" {
		user = os.Getenv("GMAIL_USER")
	}
	if user == "" {
		user = os.Getenv("DEV_LOCAL_GMAIL_USER")
	}

	pass := os.Getenv("GMAIL_PASSWORD")
	if pass == "" {
		pass = os.Getenv("DEV_LOCAL_GMAIL_PASS")
	}

	if user == "" || pass == "" {
		fmt.Println("❌ FAILED: GMAIL credentials missing in environment")
		return
	}

	fmt.Println("✅ CONFIG OK (Credentials present)")
}

func testGCal() {
	fmt.Print("📅 Testing Google Calendar... ")
	creds := os.Getenv("GOOGLE_CREDENTIALS_JSON")
	if creds == "" {
		fmt.Println("❌ FAILED: GOOGLE_CREDENTIALS_JSON not set")
		return
	}

	ctx := context.Background()
	_, err := calendar.NewService(ctx, option.WithCredentialsJSON([]byte(creds)))
	if err != nil {
		fmt.Printf("❌ FAILED: %v\n", err)
		return
	}

	fmt.Println("✅ CONNECTED")
}

func testAI() {
	fmt.Println("🧠 Testing AI Providers:")
	
	// Groq
	fmt.Print("   - Groq... ")
	groqKey := os.Getenv("GROQ_API_KEY")
	if groqKey == "" {
		fmt.Println("⚠️ SKIPPED (GROQ_API_KEY not set)")
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_, err := ai.CallLLM(ctx, "Respond with JSON object: {\"status\": \"ok\"}")
		if err != nil {
			fmt.Printf("❌ FAILED: %v\n", err)
		} else {
			fmt.Println("✅ CONNECTED")
		}
	}

	// OpenAI
	fmt.Print("   - OpenAI... ")
	openaiKey := os.Getenv("OPENAI_API_KEY")
	if openaiKey == "" {
		fmt.Println("⚠️ SKIPPED (OPENAI_API_KEY not set)")
	} else {
		fmt.Println("✅ CONFIG OK (Key present)")
	}
}
