// cmd/tools/gcal_webhook_setup.go
// Herramienta para configurar Google Calendar Webhook
//
// Uso:
//   go run cmd/tools/gcal_webhook_setup.go \
//     --calendar-id primary \
//     --webhook-url https://windmill.stax.ink/api/gcal/webhook \
//     --webhook-id booking-titanium-001 \
//     --token <secret-token> \
//     --credentials-path ~/.secrets_wm/booking-sa-key.json

package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"os"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

type Config struct {
	CalendarID      string
	WebhookURL      string
	WebhookID       string
	SecretToken     string
	CredentialsPath string
	Renew           bool
}

func main() {
	// Parsear flags
	calendarID := flag.String("calendar-id", "primary", "Calendar ID (default: primary)")
	webhookURL := flag.String("webhook-url", "", "Webhook URL (required)")
	webhookID := flag.String("webhook-id", "", "Unique webhook ID (required)")
	token := flag.String("token", "", "Secret token for validation (required)")
	credsPath := flag.String("credentials-path", "", "Path to Service Account JSON (required)")
	renew := flag.Bool("renew", false, "Renew existing webhook")

	flag.Parse()

	// Validar flags requeridas
	if *webhookURL == "" {
		fmt.Println("❌ Error: --webhook-url is required")
		flag.Usage()
		os.Exit(1)
	}

	if *webhookID == "" {
		fmt.Println("❌ Error: --webhook-id is required")
		flag.Usage()
		os.Exit(1)
	}

	if *token == "" {
		fmt.Println("❌ Error: --token is required")
		flag.Usage()
		os.Exit(1)
	}

	if *credsPath == "" {
		fmt.Println("❌ Error: --credentials-path is required")
		flag.Usage()
		os.Exit(1)
	}

	// Verificar HTTPS
	if len(*webhookURL) < 8 || (*webhookURL)[:8] != "https://" {
		fmt.Println("❌ Error: webhook URL must use HTTPS")
		fmt.Println("   Example: https://windmill.stax.ink/api/gcal/webhook")
		os.Exit(1)
	}

	config := Config{
		CalendarID:      *calendarID,
		WebhookURL:      *webhookURL,
		WebhookID:       *webhookID,
		SecretToken:     *token,
		CredentialsPath: *credsPath,
		Renew:           *renew,
	}

	// Ejecutar setup
	ctx := context.Background()
	err := setupWebhook(ctx, config)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\n✅ Webhook configured successfully!")
	fmt.Println("\nNext steps:")
	fmt.Println("1. Test webhook: curl -X POST https://windmill.stax.ink/api/gcal/webhook \\")
	fmt.Println("     -H 'X-Goog-Channel-ID: "+config.WebhookID+"' \\")
	fmt.Println("     -H 'X-Goog-Channel-Token: "+config.SecretToken+"'")
	fmt.Println("")
	fmt.Println("2. Schedule renewal: Configure Windmill cron job to run daily")
	fmt.Println("   Cron: 0 0 * * * (midnight)")
	fmt.Println("   Script: f/gcal_webhook_renew/main.go")
}

func setupWebhook(ctx context.Context, config Config) error {
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  Google Calendar Webhook Setup")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// 1. Leer credenciales
	fmt.Printf("📖 Reading credentials from: %s\n", config.CredentialsPath)
	credsJSON, err := ioutil.ReadFile(config.CredentialsPath)
	if err != nil {
		return fmt.Errorf("failed to read credentials: %w", err)
	}

	// 2. Crear cliente de Calendar
	fmt.Println("🔐 Creating Calendar service client...")
	creds, err := google.CredentialsFromJSON(ctx, credsJSON, calendar.CalendarScope)
	if err != nil {
		return fmt.Errorf("failed to parse credentials: %w", err)
	}

	service, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return fmt.Errorf("failed to create Calendar service: %w", err)
	}

	// 3. Detener webhook anterior (si existe y es renew)
	if config.Renew {
		fmt.Printf("🛑 Stopping old webhook: %s\n", config.WebhookID)
		stopChannel := &calendar.Channel{
			Id: config.WebhookID,
		}

		err = service.Channels.Stop(stopChannel).Do()
		if err != nil {
			fmt.Printf("   Note: Failed to stop old channel (may be expired): %v\n", err)
		}
	}

	// 4. Registrar nuevo webhook
	fmt.Printf("📡 Registering webhook:\n")
	fmt.Printf("   Calendar ID: %s\n", config.CalendarID)
	fmt.Printf("   Webhook URL: %s\n", config.WebhookURL)
	fmt.Printf("   Webhook ID:  %s\n", config.WebhookID)
	fmt.Printf("   Token:       %s\n", maskToken(config.SecretToken))

	channel := &calendar.Channel{
		Id:      config.WebhookID,
		Type:    "web_hook",
		Address: config.WebhookURL,
		Token:   config.SecretToken,
	}

	result, err := service.Events.Watch(config.CalendarID, channel).Do()
	if err != nil {
		return fmt.Errorf("failed to register webhook: %w", err)
	}

	// 5. Procesar respuesta
	fmt.Println()
	fmt.Println("✅ Webhook registered successfully!")
	fmt.Println()
	fmt.Println("📊 Webhook Details:")
	fmt.Printf("   Channel ID:    %s\n", result.Id)
	fmt.Printf("   Resource ID:   %s\n", result.ResourceId)
	fmt.Printf("   Resource URI:  %s\n", result.ResourceUri)

	// Expiration
	expirationMillis := result.Expiration
	if expirationMillis != 0 {
		expirationTime := time.Unix(0, expirationMillis*1000000)
		daysUntilExpiration := time.Until(expirationTime).Hours() / 24

		fmt.Printf("   Expiration:    %s\n", expirationTime.Format(time.RFC3339))
		fmt.Printf("   Days Left:     %.1f days\n", daysUntilExpiration)

		if daysUntilExpiration < 2 {
			fmt.Println()
			fmt.Println("⚠️  WARNING: Webhook expires in less than 2 days!")
			fmt.Println("   Schedule renewal immediately.")
		}
	}

	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════")

	return nil
}

func maskToken(token string) string {
	if len(token) <= 4 {
		return "****"
	}
	return token[:2] + "..." + token[len(token)-2:]
}

// Helper para imprimir JSON
func printJSON(data interface{}) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	encoder.Encode(data)
}
