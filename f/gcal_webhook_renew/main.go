package inner

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// GCalWebhookRenewInput representa el input para renovar webhook de GCal
type GCalWebhookRenewInput struct {
	CalendarID   string `json:"calendar_id"`   // "primary" o ID específico
	WebhookURL   string `json:"webhook_url"`   // https://windmill.stax.ink/api/gcal/webhook
	WebhookID    string `json:"webhook_id"`    // Mismo ID del webhook anterior
	SecretToken  string `json:"secret_token"`  // Mismo token (o nuevo)
	Credentials  string `json:"credentials"`   // Service Account JSON
	ForceRenew   bool   `json:"force_renew"`   // Si true, renueva aunque no esté cerca de expirar
}

// GCalWebhookRenewResult representa el resultado de la renovación
type GCalWebhookRenewResult struct {
	Success           bool   `json:"success"`
	ChannelID         string `json:"channel_id"`
	ResourceID        string `json:"resource_id"`
	ResourceURI       string `json:"resource_uri"`
	Expiration        string `json:"expiration"`
	DaysUntilExpiry   float64 `json:"days_until_expiry"`
	RenewedAt         string `json:"renewed_at"`
	PreviousExpired   bool   `json:"previous_expired"` // Si el webhook anterior ya había expirado
	Message           string `json:"message,omitempty"`
	Error             string `json:"error,omitempty"`
}

// main renueva un webhook de Google Calendar antes de que expire
// Los webhooks de GCal expiran después de máximo 7 días
// Este script debe ejecutarse diariamente vía cron: 0 0 * * * (medianoche)
func main(ctx context.Context, input GCalWebhookRenewInput) (GCalWebhookRenewResult, error) {
	source := "GCal_Webhook_Renew"
	version := "1.0.0"

	// ==========================================================================
	// 1. VALIDAR INPUT
	// ==========================================================================

	if input.CalendarID == "" {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   "validation: calendar_id is required",
		}, nil
	}

	if input.WebhookURL == "" {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   "validation: webhook_url is required",
		}, nil
	}

	if input.WebhookID == "" {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   "validation: webhook_id is required",
		}, nil
	}

	if input.SecretToken == "" {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   "validation: secret_token is required",
		}, nil
	}

	if input.Credentials == "" {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   "validation: credentials (Service Account JSON) is required",
		}, nil
	}

	// ==========================================================================
	// 2. CREAR CLIENTE DE GOOGLE CALENDAR
	// ==========================================================================

	creds, err := google.CredentialsFromJSON(ctx, []byte(input.Credentials), calendar.CalendarScope)
	if err != nil {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   fmt.Sprintf("credentials: failed to parse Service Account JSON: %v", err),
		}, nil
	}

	service, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return GCalWebhookRenewResult{
			Success: false,
			Error:   fmt.Sprintf("service: failed to create Calendar service: %v", err),
		}, nil
	}

	// ==========================================================================
	// 3. DETENER WEBHOOK ANTERIOR
	// ==========================================================================

	fmt.Printf("Stopping old webhook: id=%s\n", input.WebhookID)

	stopChannel := &calendar.Channel{
		Id: input.WebhookID,
	}

	err = service.Channels.Stop(stopChannel).Do()
	if err != nil {
		// Loggear pero continuar (puede que haya expirado)
		fmt.Printf("Note: Failed to stop old channel (may be expired): %v\n", err)
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

	fmt.Printf("Registering renewed webhook: id=%s, url=%s, calendar=%s\n",
		input.WebhookID, input.WebhookURL, input.CalendarID)

	result, err := service.Events.Watch(input.CalendarID, channel).Do()
	if err != nil {
		return GCalWebhookRenewResult{
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

	// Determinar si el previous webhook estaba expirado
	// (esto sería ideal verificarlo en una tabla de tracking)
	previousExpired := false

	message := fmt.Sprintf("Webhook renewed successfully. Expires in %.1f days", daysUntilExpiration)

	return GCalWebhookRenewResult{
		Success:         true,
		ChannelID:       result.Id,
		ResourceID:      result.ResourceId,
		ResourceURI:     result.ResourceUri,
		Expiration:      expirationTime.Format(time.RFC3339),
		DaysUntilExpiry: daysUntilExpiration,
		RenewedAt:       time.Now().UTC().Format(time.RFC3339),
		PreviousExpired: previousExpired,
		Message:         message,
	}, nil
}
