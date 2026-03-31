package inner

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// GCalWebhookSetupInput representa el input para configurar webhook de GCal
type GCalWebhookSetupInput struct {
	CalendarID   string `json:"calendar_id"`   // "primary" o ID específico de calendario
	WebhookURL   string `json:"webhook_url"`   // https://windmill.stax.ink/api/gcal/webhook
	WebhookID    string `json:"webhook_id"`    // Unique ID para este channel (ej: "booking-titanium-001")
	SecretToken  string `json:"secret_token"`  // Token secreto para validación
	Credentials  string `json:"credentials"`   // Service Account JSON credentials
}

// GCalWebhookSetupResult representa el resultado del setup
type GCalWebhookSetupResult struct {
	Success      bool   `json:"success"`
	ChannelID    string `json:"channel_id"`
	ResourceID   string `json:"resource_id"`
	ResourceURI  string `json:"resource_uri"`
	Expiration   string `json:"expiration"` // RFC3339 format
	WebhookURL   string `json:"webhook_url"`
	Message      string `json:"message,omitempty"`
	Error        string `json:"error,omitempty"`
}

// main configura un webhook de Google Calendar para notificar cambios
// Este script se ejecuta una vez para registrar el webhook inicial
// Luego se usa gcal_webhook_renew para renovar antes de la expiración (7 días máx)
func main(ctx context.Context, input GCalWebhookSetupInput) (GCalWebhookSetupResult, error) {
	source := "GCal_Webhook_Setup"
	version := "1.0.0"

	// ==========================================================================
	// 1. VALIDAR INPUT
	// ==========================================================================

	if input.CalendarID == "" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: calendar_id is required",
		}, nil
	}

	if input.WebhookURL == "" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: webhook_url is required",
		}, nil
	}

	// Verificar HTTPS (Google solo acepta HTTPS)
	if len(input.WebhookURL) < 8 || input.WebhookURL[:8] != "https://" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: webhook_url must use HTTPS",
		}, nil
	}

	if input.WebhookID == "" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: webhook_id is required",
		}, nil
	}

	if input.SecretToken == "" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: secret_token is required",
		}, nil
	}

	if input.Credentials == "" {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   "validation: credentials (Service Account JSON) is required",
		}, nil
	}

	// ==========================================================================
	// 2. CREAR CLIENTE DE GOOGLE CALENDAR
	// ==========================================================================

	creds, err := google.CredentialsFromJSON(ctx, []byte(input.Credentials), calendar.CalendarScope)
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("credentials: failed to parse Service Account JSON: %v", err),
		}, nil
	}

	service, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("service: failed to create Calendar service: %v", err),
		}, nil
	}

	// ==========================================================================
	// 3. DETENER WEBHOOK ANTERIOR (SI EXISTE)
	// ==========================================================================

	// Intentar detener el channel anterior (mejor práctica)
	stopChannel := &calendar.Channel{
		Id: input.WebhookID,
	}

	err = service.Channels.Stop(stopChannel).Do()
	if err != nil {
		// No es fatal, puede que no exista un channel previo
		fmt.Printf("Note: Failed to stop old channel (may not exist): %v\n", err)
	}

	// ==========================================================================
	// 4. REGISTRAR NUEVO WEBHOOK
	// ==========================================================================

	channel := &calendar.Channel{
		Id:      input.WebhookID,
		Type:    "web_hook",
		Address: input.WebhookURL,
		Token:   input.SecretToken,
	}

	fmt.Printf("Registering webhook: id=%s, url=%s, calendar=%s\n",
		input.WebhookID, input.WebhookURL, input.CalendarID)

	result, err := service.Events.Watch(input.CalendarID, channel).Do()
	if err != nil {
		return GCalWebhookSetupResult{
			Success: false,
			Error:   fmt.Sprintf("watch: failed to register webhook: %v", err),
		}, nil
	}

	// ==========================================================================
	// 5. PROCESAR RESPUESTA
	// ==========================================================================

	// Google retorna expiration en milisegundos (int64)
	expirationMillis := result.Expiration
	
	// Convertir a time.Time
	var expirationTime time.Time
	if expirationMillis != 0 {
		expirationTime = time.Unix(0, expirationMillis*1000000)
	}

	// Calcular días hasta expiración
	daysUntilExpiration := time.Until(expirationTime).Hours() / 24

	message := fmt.Sprintf("Webhook registered successfully. Expires in %.1f days", daysUntilExpiration)

	return GCalWebhookSetupResult{
		Success:     true,
		ChannelID:   result.Id,
		ResourceID:  result.ResourceId,
		ResourceURI: result.ResourceUri,
		Expiration:  expirationTime.Format(time.RFC3339),
		WebhookURL:  input.WebhookURL,
		Message:     message,
	}, nil
}
