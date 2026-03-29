package communication

import (
	"fmt"
	"math"
	"net/smtp"
	"os"
	"strings"
	"time"

	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// GmailConfig holds Gmail SMTP configuration
type GmailConfig struct {
	SMTPHost  string
	SMTPPort  int
	Username  string
	Password  string
	FromEmail string
	FromName  string
}

// resolveGmailCredentials multiplexes between local env vars (dev) and Windmill variables (prod)
func resolveGmailCredentials() (*GmailConfig, error) {
	// 1. Try local development mode
	localUser := os.Getenv("DEV_LOCAL_GMAIL_USER")
	localPass := os.Getenv("DEV_LOCAL_GMAIL_PASS")
	
	if localUser != "" && localPass != "" {
		// Use local environment variables
		return &GmailConfig{
			SMTPHost:  getEnv("SMTP_HOST", "smtp.gmail.com"),
			SMTPPort:  getEnvInt("SMTP_PORT", 587),  // STARTTLS port for Gmail
			Username:  localUser,
			Password:  localPass,
			FromEmail: getEnv("GMAIL_FROM_EMAIL", localUser),
			FromName:  getEnv("GMAIL_FROM_NAME", "Booking Titanium"),
		}, nil
	}

	// 2. Production mode - use standard env vars (set by Windmill)
	username := os.Getenv("GMAIL_USER")
	password := os.Getenv("GMAIL_PASSWORD")
	
	if username == "" || password == "" {
		return nil, fmt.Errorf("Gmail credentials not configured: GMAIL_USER or GMAIL_PASSWORD not set")
	}

	return &GmailConfig{
		SMTPHost:  getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:  getEnvInt("SMTP_PORT", 465),  // SSL port for Gmail
		Username:  username,
		Password:  password,
		FromEmail: getEnv("GMAIL_FROM_EMAIL", username),
		FromName:  getEnv("GMAIL_FROM_NAME", "Booking Titanium"),
	}, nil
}

// GetGmailConfig returns the Gmail configuration from environment or local dev vars
func GetGmailConfig() (*GmailConfig, error) {
	return resolveGmailCredentials()
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := fmt.Sscanf(value, "%d", &defaultValue); err == nil && i > 0 {
			return defaultValue
		}
	}
	return defaultValue
}

// SendEmailRequest represents a request to send an email
type SendEmailRequest struct {
	ToEmail      string   `json:"to_email"`
	ToName       string   `json:"to_name,omitempty"`
	Subject      string   `json:"subject"`
	Body         string   `json:"body"`
	IsHTML       bool     `json:"is_html,omitempty"`
	CcEmails     []string `json:"cc_emails,omitempty"`
	BccEmails    []string `json:"bcc_emails,omitempty"`
	ReplyToEmail string   `json:"reply_to_email,omitempty"`
}

// SendEmail envía un email vía Gmail SMTP
func SendEmail(req SendEmailRequest) types.StandardContractResponse[map[string]any] {
	source := "GMAIL_Send_Confirmation"
	workflowID := "gmail-send-v1"
	version := "1.0.0"

	// Validate to_email
	if req.ToEmail == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"to_email is required",
			source,
			workflowID,
			version,
		)
	}

	// Validate email format
	emailValidation := utils.ValidateEmail(req.ToEmail, "to_email")
	if !emailValidation.Valid {
		return utils.ErrorResponse[map[string]any](
			emailValidation.Error,
			emailValidation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Validate subject
	if req.Subject == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"subject is required",
			source,
			workflowID,
			version,
		)
	}

	// Validate body
	if req.Body == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"body is required",
			source,
			workflowID,
			version,
		)
	}

	// Get config
	config, err := GetGmailConfig()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeGmailError,
			fmt.Sprintf("Gmail configuration error: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Validate credentials
	if config.Username == "" || config.Password == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeGmailError,
			"Gmail credentials not configured",
			source,
			workflowID,
			version,
		)
	}

	// Set from email
	fromEmail := config.FromEmail
	if fromEmail == "" {
		fromEmail = config.Username
	}

	// Build email
	var contentType string
	if req.IsHTML {
		contentType = "text/html; charset=utf-8"
	} else {
		contentType = "text/plain; charset=utf-8"
	}

	headers := make(map[string]string)
	if req.ToName != "" {
		headers["To"] = fmt.Sprintf("%s <%s>", req.ToName, req.ToEmail)
	} else {
		headers["To"] = req.ToEmail
	}
	headers["From"] = fmt.Sprintf("%s <%s>", config.FromName, fromEmail)
	headers["Subject"] = req.Subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = contentType
	headers["Date"] = time.Now().Format(time.RFC1123Z)

	if req.ReplyToEmail != "" {
		headers["Reply-To"] = req.ReplyToEmail
	}

	// Build message
	message := ""
	for key, value := range headers {
		message += fmt.Sprintf("%s: %s\r\n", key, value)
	}

	if len(req.CcEmails) > 0 {
		message += fmt.Sprintf("Cc: %s\r\n", strings.Join(req.CcEmails, ", "))
	}

	message += "\r\n" + req.Body

	// Build recipients list
	recipients := []string{req.ToEmail}
	recipients = append(recipients, req.CcEmails...)
	recipients = append(recipients, req.BccEmails...)

	// Send email
	auth := smtp.PlainAuth("", config.Username, config.Password, config.SMTPHost)
	addr := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)

	sendErr := smtp.SendMail(addr, auth, fromEmail, recipients, []byte(message))
	if sendErr != nil {
		errorCode, errorMessage := classifyGmailError(sendErr)

		return utils.ErrorResponse[map[string]any](
			errorCode,
			errorMessage,
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"sent":        true,
		"to_email":    req.ToEmail,
		"subject":     req.Subject,
		"sent_at":     time.Now().UTC().Format(time.RFC3339),
		"is_html":     req.IsHTML,
		"body_length": len(req.Body),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// SendEmailBookingConfirmation envía una confirmación de reserva por email
func SendEmailBookingConfirmation(
	toEmail string,
	toName string,
	bookingID string,
	providerName string,
	serviceName string,
	startTime string,
) types.StandardContractResponse[map[string]any] {

	// Build HTML body
	body := fmt.Sprintf(
		`<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #0066cc; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Reserva Confirmada</h1>
    </div>
    <div class="content">
      <p>Hola %s,</p>
      <p>Tu reserva ha sido confirmada exitosamente.</p>
      
      <div class="details">
        <h3>📋 Detalles de la Reserva</h3>
        <p><strong>ID de Reserva:</strong> %s</p>
        <p><strong>Proveedor:</strong> %s</p>
        <p><strong>Servicio:</strong> %s</p>
        <p><strong>Fecha:</strong> %s</p>
      </div>
      
      <p>Gracias por confiar en nosotros. Te esperamos!</p>
    </div>
    <div class="footer">
      <p>Booking Titanium - Sistema de Reservas</p>
    </div>
  </div>
</body>
</html>`,
		toName,
		bookingID,
		providerName,
		serviceName,
		startTime,
	)

	req := SendEmailRequest{
		ToEmail: toEmail,
		ToName:  toName,
		Subject: fmt.Sprintf("✅ Reserva Confirmada - %s", serviceName),
		Body:    body,
		IsHTML:  true,
	}

	return SendEmail(req)
}

// SendEmailBookingCancellation envía una cancelación de reserva por email
func SendEmailBookingCancellation(
	toEmail string,
	toName string,
	bookingID string,
	reason string,
) types.StandardContractResponse[map[string]any] {

	// Build HTML body
	body := fmt.Sprintf(
		`<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #cc0000; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #cc0000; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Reserva Cancelada</h1>
    </div>
    <div class="content">
      <p>Hola %s,</p>
      <p>Tu reserva ha sido cancelada.</p>
      
      <div class="details">
        <h3>📋 Detalles de la Cancelación</h3>
        <p><strong>ID de Reserva:</strong> %s</p>
        <p><strong>Motivo:</strong> %s</p>
      </div>
      
      <p>Si tienes alguna consulta o deseas reagendar, no dudes en contactarnos.</p>
    </div>
    <div class="footer">
      <p>Booking Titanium - Sistema de Reservas</p>
    </div>
  </div>
</body>
</html>`,
		toName,
		bookingID,
		reason,
	)

	req := SendEmailRequest{
		ToEmail: toEmail,
		ToName:  toName,
		Subject: "❌ Reserva Cancelada",
		Body:    body,
		IsHTML:  true,
	}

	return SendEmail(req)
}

// classifyGmailError clasifica los errores de Gmail SMTP
func classifyGmailError(err error) (string, string) {
	errStr := err.Error()

	switch {
	case strings.Contains(errStr, "authentication"):
		return types.ErrorCodeGmailError, "Gmail authentication failed"

	case strings.Contains(errStr, "535"):
		return types.ErrorCodeGmailError, "Gmail authentication failed - invalid credentials"

	case strings.Contains(errStr, "quota") || strings.Contains(errStr, "421"):
		return types.ErrorCodeGmailError, "Gmail quota exceeded"

	case strings.Contains(errStr, "connection"):
		return types.ErrorCodeGmailError, "Failed to connect to Gmail SMTP server"

	case strings.Contains(errStr, "timeout"):
		return types.ErrorCodeGmailError, "Gmail SMTP connection timeout"

	default:
		return types.ErrorCodeGmailError, fmt.Sprintf("Gmail SMTP error: %v", err)
	}
}

// ============================================================================
// RETRY PROTOCOL (v4.0 LAW-15)
// ============================================================================

const (
	GmailMaxRetries     = 3
	GmailBaseBackoffSec = 1 // Backoff: 1s, 3s, 9s (3^attempt)
	GmailTimeoutSeconds = 30
)

// SendEmailWithRetry sends an email with exponential backoff retry
func SendEmailWithRetry(
	toEmail string,
	subject string,
	body string,
	isHTML bool,
) types.StandardContractResponse[map[string]any] {

	var lastResp types.StandardContractResponse[map[string]any]

	for attempt := 0; attempt < GmailMaxRetries; attempt++ {
		resp := SendEmail(SendEmailRequest{
			ToEmail: toEmail,
			Subject: subject,
			Body:    body,
			IsHTML:  isHTML,
		})

		if resp.Success {
			return resp
		}

		lastResp = resp

		// Check if error is permanent (4xx, auth errors) or transient (5xx, timeout, network)
		if isPermanentGmailError(resp) {
			// Permanent error: don't retry
			return resp
		}

		// Transient error: retry with backoff
		if attempt < GmailMaxRetries-1 {
			backoff := time.Duration(math.Pow(3, float64(attempt))) * time.Second
			time.Sleep(backoff) // 1s, 3s, 9s
		}
	}

	// All retries failed
	return lastResp
}

// isPermanentGmailError checks if an error is permanent (should not retry)
func isPermanentGmailError(resp types.StandardContractResponse[map[string]any]) bool {
	if resp.ErrorCode == nil {
		return false // Assume transient if no error code
	}

	errCode := *resp.ErrorCode

	// Permanent errors
	permanentCodes := map[string]bool{
		types.ErrorCodeGmailError: true,
		types.ErrorCodeMissingField: true,
		types.ErrorCodeInvalidInput: true,
	}

	// Check error message for permanent error indicators
	if resp.ErrorMessage != nil {
		errMsg := *resp.ErrorMessage
		if strings.Contains(errMsg, "authentication") ||
			strings.Contains(errMsg, "535") ||
			strings.Contains(errMsg, "quota") ||
			strings.Contains(errMsg, "invalid credentials") {
			return true
		}
	}

	return permanentCodes[errCode]
}

// SendConfirmationEmailWithRetry sends a booking confirmation email with retry (v4.0 §8)
func SendConfirmationEmailWithRetry(
	toEmail string,
	userName string,
	bookingID string,
	serviceName string,
	startTime string,
	providerName string,
) types.StandardContractResponse[map[string]any] {

	source := "Gmail_Confirmation_With_Retry"
	workflowID := "gmail-confirmation-retry-v1"
	version := "1.0.0"

	// Format email content
	subject := "✅ Confirmación de Cita Médica"
	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Cita Agendada</h1>
        </div>
        <div class="content">
            <p>Hola %s,</p>
            <p>Tu cita médica ha sido confirmada exitosamente.</p>
            
            <div class="details">
                <h3>📋 Detalles de la Cita:</h3>
                <p><strong>ID de cita:</strong> %s</p>
                <p><strong>Servicio:</strong> %s</p>
                <p><strong>Proveedor:</strong> %s</p>
                <p><strong>Fecha y Hora:</strong> %s</p>
            </div>
            
            <p>Para cancelar o reagendar tu cita, por favor responde a este correo o contáctanos a través de Telegram.</p>
            
            <p><strong>Política de cancelación:</strong> Las citas pueden cancelarse hasta 24 horas antes sin costo.</p>
        </div>
        <div class="footer">
            <p>Booking Titanium - Sistema de Gestión de Citas Médicas</p>
        </div>
    </div>
</body>
</html>`,
		userName,
		bookingID,
		serviceName,
		providerName,
		startTime,
	)

	resp := SendEmailWithRetry(toEmail, subject, htmlBody, true)

	// Override meta for confirmation context
	resp.Meta.Source = source
	resp.Meta.WorkflowID = workflowID
	resp.Meta.Version = version

	return resp
}
